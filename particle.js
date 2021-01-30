let random_pos

function HSL_RGB(h, s, l, hex = true) {
    let C = (1 - Math.abs(2 * l - 1)) * s
    let X = C * (1 - Math.abs((h / 60) % 2 - 1))
    let m = l - C / 2
    let r = 0, g = 0, b = 0

    if (s) {
        if (h < 60)
            r = C, g = X
        else if (h < 120)
            r = X, g = C
        else if (h < 180)
            g = C, b = X
        else if (h < 240)
            g = X, b = C
        else if (h < 300)
            r = X, b = C
        else if (h < 360)
            r = C, b = X
    } else r = g = b = l

    r = Math.round((r + m) * 255)
    g = Math.round((g + m) * 255)
    b = Math.round((b + m) * 255)

    if (hex)
        return r << 16 | g << 8 | b
    else
        return [r, g, b, C, X, m]
}

class Particle {
    constructor (ix, iy, canvas, scale) {
        this.canvas = canvas
        this.scale = scale

        this.pos = [ix, iy]
        this.last = this.screen
    }

    move(done) {
        return (vec, move_hook) => {
            this.last = this.screen;

            let rst = typeof move_hook !== "undefined" ? move_hook(vec) : vec

            this.pos[0] += rst[0]
            this.pos[1] += rst[1]

            if (this.pos[0] < -2 ||
                this.pos[0] > this.scale + 2 ||
                this.pos[1] < -2 ||
                this.pos[1] > this.scale + 2) {
                    this.pos = random_pos()
                    this.last = this.screen
                }

            done()
        }
    }

    get screen() {
        return [this.canvas.width, this.canvas.height]
            .map((e, i) => Math.round(e * this.pos[i] / this.scale))
    }
}

function particle(options = {}) {
    const {
        canvas_name = "can",
        func = "perlin",
        scale = 12,
        particle_count = 1024,
        opt = [],
        time = 5000,
        queue_hook,
        noise_hook,
        move_hook,
        draw_hook,
        frame_hook
    } = options

    const canvas = document.getElementById(canvas_name)
    const context = canvas.getContext("2d")

    context.clearRect(0, 0, canvas.width, canvas.width)
    context.lineWidth = 1
    context.strokeStyle = "rgba(255,255,255,.0625)"
    context.fillStyle = "rgba(22,22,29,.5)"

    let last = performance.now()
    let start = last

    random_pos = _ => [ (scale + 1) * random_float() - 1, (scale + 1) * random_float() - 1 ]

    let particles = new Array(particle_count).fill(0)
        .map(_ => new Particle(...random_pos(), canvas, scale))
    let p = [...new Array(256).keys()]
        .map((v, _, a, j = random(255)) => [a[j], a[j] = v][0])
    let slice = random_float() * random(255)

    let loop = _ => {
        let now = performance.now()

        if (now - last < 1000 / 30)
            return requestAnimationFrame(loop)

        noise(data => {
            while (data[1].length) {
                let [vec, d] = noise_hook(data[1])
                let index = vec.splice(0, 1)[0]
                let p = particles[index]
    
                data[1] = d
    
                p.move(_ => {
                    if (draw_hook)
                        draw_hook(context, vec[0])

                    context.beginPath()
                    context.moveTo(...p.last)
                    context.lineTo(...p.screen)
                    context.stroke()
                })(vec[0], move_hook)
            }

            if (frame_hook) frame_hook(canvas, context)
        }, {
            func: func,
            pos: queue_hook(particles),
            params: opt,
            p: p,
            slice: slice
        })

        if (now - start > time) return

        last = now
        requestAnimationFrame(loop)
    }

    return loop
}
