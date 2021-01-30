const MAX_UINT32 = new Uint32Array(1).fill(-1)[0]

function random_float() {
    return self.crypto ?
        self.crypto.getRandomValues(new Uint32Array(1))[0] / MAX_UINT32 :
        Math.random()
}

function random(max, min = 0, safe = false) {
    let val = (random_float() * (max - min + 1) + min)

    return safe ? Math.trunc(val) : ~~val
}

class BarnWorker {
    constructor (path = "./noise.js") {
        this.worker = new Worker(path)
        this.locked = false
        this.working = false
        this.id = new Array(16).fill(0).map(_ => random(15).toString(16)).join("")

        this.worker.onmessage = e => {
            if (e.data[0] == this.id)
                this.callback(e.data.slice(1))
        }
    }

    post = (msg, cb) => {
        this.worker.postMessage([this.id, ...msg])
        this.callback = cb
    }

    close = _ => this.worker.terminate()
}

class Barn {
    constructor (max_threads = 4, path) {
        this.pool = []
        this.max_threads = max_threads

        this.p = [...new Array(256).keys()]
        .map((v, _, a, j = random(255)) => [a[j], a[j] = v][0])
        this.perm = new Array(512).fill(0).map((_, i) => this.p[i & 255])
        this.slice = random_float() * random(255)
        this.path = path
    }

    get worker() {
        for (let worker of this.pool)
            if (!worker.locked) return (worker.locked = true, worker)

        if (this.pool.length < this.max_threads) {
            let worker = new BarnWorker(this.path)
            worker.post(["setup", performance.now(), this.perm, this.slice])

            this.pool.push(worker)
            this.worker.locked = true
            return worker
        }

        return null
    }
}

class Perlin {
    constructor (perm, slice) {
        this.grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ]

        this.perm = perm
        this.slice = slice
        this.grad = new Array(512)

        for (let i = 0; i < 256; i++)
            this.grad[i] = this.grad[i + 256] = this.grad3[i % 12]
    }

    dot = (g, x, y, z) => g[0] * x + g[1] * y + g[2] * z
    mix = (a, b, t) => (1 - t) * a + t * b
    fade = t => t * t * t * (t * (t * 6 - 15) + 10)

    get(a, b, c = this.slice) {
        let X = Math.floor(a)
        let Y = Math.floor(b)
        let Z = Math.floor(c)

        let x = a - X
        let y = b - Y
        let z = c - Z

        let u = this.fade(x)
        let v = this.fade(y)
        let w = this.fade(z)

        X = X & 255
        Y = Y & 255
        Z = Z & 255

        let n000 = this.dot(this.grad[this.perm[X + this.perm[Y + this.perm[Z]]]], x, y, z)
        let n001 = this.dot(this.grad[this.perm[X + this.perm[Y + this.perm[Z+1]]]], x, y, z-1)
        let n010 = this.dot(this.grad[this.perm[X + this.perm[Y+1 + this.perm[Z]]]], x, y-1, z)
        let n011 = this.dot(this.grad[this.perm[X + this.perm[Y+1 + this.perm[Z+1]]]], x, y-1, z-1)
        let n100 = this.dot(this.grad[this.perm[X+1 + this.perm[Y + this.perm[Z]]]], x-1, y, z)
        let n101 = this.dot(this.grad[this.perm[X+1 + this.perm[Y + this.perm[Z+1]]]], x-1, y, z-1)
        let n110 = this.dot(this.grad[this.perm[X+1 + this.perm[Y+1 + this.perm[Z]]]], x-1, y-1, z)
        let n111 = this.dot(this.grad[this.perm[X+1 + this.perm[Y+1 + this.perm[Z+1]]]], x-1, y-1, z-1)

        return this.mix(
                this.mix(this.mix(n000, n100, u),this.mix(n010, n110, u), v),
                this.mix(this.mix(n001, n101, u),this.mix(n011, n111, u), v), w)
    }
}

class FBM extends Perlin {
    constructor (perm, slice) { super(perm, slice) }

    fbm(x, y, z = this.slice) {
        let f = 1, a = 1, t = 0

        for (let i = 0; i < 3; i++) {
            t += a * super.get(f * x, f * y, z)
            f *= 2
            a /= 2
        }

        return t
    }

    fbm2(x, y, z = this.slice) {
        return this.fbm(
            x + 4 * this.fbm(x, y, z),
            y + 4 * this.fbm(
                x + 2 * Math.PI,
                y + .5 * Math.E,
                z
            ),
            z
        )
    }

    fbm3(x, y, z = this.slice) {
        let q = [this.fbm(x, y, z), this.fbm(x + 2 * Math.PI, y + .5 * Math.E, z)]

        return this.fbm(
            this.fbm(
                x + 4 * q[0] + Math.E - 1,
                y + 4 * q[1] + Math.PI * 2.5,
                z
            ),
            this.fbm(
                x + 4 * q[0] + Math.Pi * 3,
                y + 4 * q[1] + Math.E,
                z
            ),
            z
        )
    }
}

class Curl extends FBM {
    constructor (perm, slice) {
        super(perm, slice)
        this.start = performance.now()
    }

    get(x, y, step = [1e-4, 1e-4], start = this.start ) {
        this.slice = super.get(
            Math.random() + 3 * Math.sin(Math.random() * (start - performance.now())),
            Math.random() + 3 * Math.cos(Math.random() * (start - performance.now())),
            0
        )

        let fx = super.fbm(x + step[0], y) - super.fbm(x - step[0], y)
        let fy = super.fbm(x, y + step[1]) - super.fbm(x, y - step[1])

        fx /= 2 * step[0]
        fy /= 2 * step[1]

        return [fy, -fx]
    }
}

function noise(callback, options = {}) {
    const {
        func = "perlin",
        pos = [[0, 0]],
        params = [],
        p = [...new Array(256).keys()].map((v, _, a, j = random(255)) => [a[j], a[j] = v][0]), 
        slice = random_float() * random(255),
        barn
    } = options

    if (barn !== undefined) {
        let worker = barn.worker

        if (worker != null)
            worker.post([func, pos, ...params], e => (worker.locked = false, callback(e)))
    } else {
        let ret

        switch (func) {
            case "perlin":
                let perlin = new Perlin(
                    new Array(512).fill(0).map((_, i) => p[i & 255]),
                    slice
                )

                if (pos[0].length == 3)
                    ret = pos.map(e => [e.splice(0, 1)[0], perlin.get(...e)])
                else
                    ret = pos.map(e => perlin.get(...e))

                return callback(["perlin", ret])
            case "fbm":
                let fbm = new FBM(
                    new Array(512).fill(0).map((_, i) => p[i & 255]),
                    slice
                )

                if (pos[0].length == 3)
                    ret = pos.map(e => [e.splice(0, 1)[0], fbm.fbm(...e)])
                else
                    ret = pos.map(e => fbm.fbm(...e))

                return callback(["fbm", ret])
            case "curl":
                let curl = new Curl(
                    new Array(512).fill(0).map((_, i) => p[i & 255]),
                    slice
                )

                let step = params[0]
                let time = params[1]

                if (pos[0].length == 3)
                    ret = pos.map(e => [e.splice(0, 1)[0], curl.get(...e, step, time)])
                else
                    ret = pos.map(e => curl.get(...e, step, time))

                return callback(["curl", ret])
        }
    }
}
