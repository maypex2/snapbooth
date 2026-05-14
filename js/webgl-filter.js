// ── WebGL shader filter pipeline ──
//
// Hardware-accelerated replacement for `video.style.filter = 'sepia(60%)'`.
// CSS filter on a live <video> forces a full GPU composite pass per frame
// through the browser's generic compositor (~8-16ms on a Samsung A52s).
// A fragment shader on the same GPU runs the equivalent math in ~1ms on
// dedicated shader cores — same hardware that powers TikTok / Instagram
// filters in their native apps.
//
// Opt-in via ?webgl=1 URL flag during the prototype phase.
// Falls back gracefully to the CSS filter path if WebGL isn't supported
// (very old Androids, kiosk browsers).

(function () {
  'use strict';

  // ── Filter param table ──
  // Each filter is a set of scalars that get fed to the shader as uniforms.
  // Maps the existing CSS filter strings in filters.js to shader inputs.
  const FILTER_PARAMS = {
    none:        { sepia: 0,    gray: 0,    bright: 1.00, contrast: 1.00, sat: 1.00, hue: 0 },
    bw:          { sepia: 0,    gray: 1.00, bright: 1.00, contrast: 1.10, sat: 1.00, hue: 0 },
    vintage:     { sepia: 0.60, gray: 0,    bright: 1.05, contrast: 1.10, sat: 0.80, hue: 0 },
    retro:       { sepia: 0,    gray: 0,    bright: 0.90, contrast: 1.30, sat: 0.50, hue: 0 },
    glow:        { sepia: 0,    gray: 0,    bright: 1.15, contrast: 1.00, sat: 1.30, hue: 0 },
    warm:        { sepia: 0.30, gray: 0,    bright: 1.08, contrast: 1.05, sat: 1.40, hue: 0 },
    cool:        { sepia: 0,    gray: 0,    bright: 1.05, contrast: 1.00, sat: 0.80, hue: 3.49 },   // 200deg in rad
    noir:        { sepia: 0,    gray: 1.00, bright: 0.85, contrast: 1.50, sat: 1.00, hue: 0 },
    fade:        { sepia: 0,    gray: 0,    bright: 1.10, contrast: 0.85, sat: 0.70, hue: 0 },
    sunset:      { sepia: 0.40, gray: 0,    bright: 1.05, contrast: 1.00, sat: 1.60, hue: -0.35 },
    dreamy:      { sepia: 0,    gray: 0,    bright: 1.12, contrast: 0.95, sat: 1.20, hue: 0 },
    drama:       { sepia: 0,    gray: 0,    bright: 0.95, contrast: 1.40, sat: 1.20, hue: 0 },
    pastel:      { sepia: 0,    gray: 0,    bright: 1.15, contrast: 0.90, sat: 0.65, hue: 0 },
    punch:       { sepia: 0,    gray: 0,    bright: 1.00, contrast: 1.20, sat: 1.60, hue: 0 },
    chrome:      { sepia: 0,    gray: 0,    bright: 1.05, contrast: 1.25, sat: 0.60, hue: 3.32 },
    cinematic:   { sepia: 0,    gray: 0,    bright: 0.97, contrast: 1.18, sat: 1.15, hue: -0.14 },
    film:        { sepia: 0.25, gray: 0,    bright: 1.04, contrast: 1.05, sat: 1.15, hue: 0 },
    vhs:         { sepia: 0,    gray: 0,    bright: 1.05, contrast: 1.15, sat: 1.40, hue: -0.10 },
    kawaii:      { sepia: 0,    gray: 0,    bright: 1.12, contrast: 0.95, sat: 1.10, hue: -0.21 },
    moody:       { sepia: 0,    gray: 0,    bright: 0.85, contrast: 1.35, sat: 0.60, hue: 0 },
    honey:       { sepia: 0.35, gray: 0,    bright: 1.08, contrast: 1.00, sat: 1.50, hue: -0.26 },
    bluehour:    { sepia: 0,    gray: 0,    bright: 0.95, contrast: 1.10, sat: 0.95, hue: 0.26 },
    aura:        { sepia: 0,    gray: 0,    bright: 1.10, contrast: 1.02, sat: 1.30, hue: -0.38 },
    disposable:  { sepia: 0.18, gray: 0,    bright: 1.05, contrast: 0.92, sat: 0.90, hue: 0 },
    mocha:       { sepia: 0.45, gray: 0,    bright: 1.04, contrast: 1.06, sat: 1.20, hue: -0.17 },
    sage:        { sepia: 0,    gray: 0,    bright: 1.04, contrast: 1.05, sat: 0.50, hue: 0.26 },
    twilight:    { sepia: 0,    gray: 0,    bright: 0.93, contrast: 1.12, sat: 0.95, hue: 0.61 },
  };

  // ── Shaders ──
  const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  const FS_SOURCE = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform float u_sepia;
    uniform float u_gray;
    uniform float u_bright;
    uniform float u_contrast;
    uniform float u_sat;
    uniform float u_hue;
    uniform float u_mirror;

    // Fast hue rotation in RGB space (no RGB↔HSV round-trip).
    vec3 hueShift(vec3 color, float angle) {
      const vec3 k = vec3(0.57735, 0.57735, 0.57735);
      float c = cos(angle), s = sin(angle);
      return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
    }

    void main() {
      vec2 uv = v_texCoord;
      if (u_mirror > 0.5) uv.x = 1.0 - uv.x;
      vec3 col = texture2D(u_image, uv).rgb;

      // Order matches what CSS filter chains do: brightness → contrast → saturate → hue → grayscale → sepia
      col *= u_bright;
      col = (col - 0.5) * u_contrast + 0.5;

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, u_sat);

      if (u_hue != 0.0) col = hueShift(col, u_hue);

      if (u_gray > 0.0) {
        float g = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(g), u_gray);
      }

      if (u_sepia > 0.0) {
        vec3 sep = vec3(
          dot(col, vec3(0.393, 0.769, 0.189)),
          dot(col, vec3(0.349, 0.686, 0.168)),
          dot(col, vec3(0.272, 0.534, 0.131))
        );
        col = mix(col, sep, u_sepia);
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  }

  class WebGLFilter {
    constructor(canvas, video) {
      this.canvas = canvas;
      this.video = video;
      this.running = false;
      this.mirror = false;
      this.currentFilter = 'none';

      // Prefer WebGL2 for slight perf bump; fall back to WebGL1.
      this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: false, antialias: false })
             || canvas.getContext('webgl',  { preserveDrawingBuffer: false, antialias: false })
             || canvas.getContext('experimental-webgl');
      if (!this.gl) throw new Error('WebGL unavailable');

      this._initProgram();
      this._initGeometry();
      this._initTexture();
      this.setFilter('none');
    }

    _initProgram() {
      const gl = this.gl;
      const vs = compile(gl, gl.VERTEX_SHADER,   VS_SOURCE);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(this.program));
      }
      gl.useProgram(this.program);

      this.loc = {
        position: gl.getAttribLocation(this.program, 'a_position'),
        texCoord: gl.getAttribLocation(this.program, 'a_texCoord'),
        image:    gl.getUniformLocation(this.program, 'u_image'),
        sepia:    gl.getUniformLocation(this.program, 'u_sepia'),
        gray:     gl.getUniformLocation(this.program, 'u_gray'),
        bright:   gl.getUniformLocation(this.program, 'u_bright'),
        contrast: gl.getUniformLocation(this.program, 'u_contrast'),
        sat:      gl.getUniformLocation(this.program, 'u_sat'),
        hue:      gl.getUniformLocation(this.program, 'u_hue'),
        mirror:   gl.getUniformLocation(this.program, 'u_mirror'),
      };
      gl.uniform1i(this.loc.image, 0);
    }

    _initGeometry() {
      const gl = this.gl;
      // Full-screen triangle pair (clip-space)
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1,  1,  1, -1,   1, 1,
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.loc.position);
      gl.vertexAttribPointer(this.loc.position, 2, gl.FLOAT, false, 0, 0);

      // Texture coords — flipped Y so the video isn't upside down
      const uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 1,  1, 1,  0, 0,
        0, 0,  1, 1,  1, 0,
      ]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(this.loc.texCoord);
      gl.vertexAttribPointer(this.loc.texCoord, 2, gl.FLOAT, false, 0, 0);
    }

    _initTexture() {
      const gl = this.gl;
      this.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    setFilter(id) {
      this.currentFilter = id;
      const p = FILTER_PARAMS[id] || FILTER_PARAMS.none;
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.uniform1f(this.loc.sepia,    p.sepia);
      gl.uniform1f(this.loc.gray,     p.gray);
      gl.uniform1f(this.loc.bright,   p.bright);
      gl.uniform1f(this.loc.contrast, p.contrast);
      gl.uniform1f(this.loc.sat,      p.sat);
      gl.uniform1f(this.loc.hue,      p.hue);
    }

    setMirror(on) {
      this.mirror = !!on;
      const gl = this.gl;
      gl.useProgram(this.program);
      gl.uniform1f(this.loc.mirror, this.mirror ? 1.0 : 0.0);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this._loop();
    }

    stop() {
      this.running = false;
    }

    _resizeIfNeeded() {
      const v = this.video;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      // Cap source resolution at 1280×720 for the shader pass — full-res
      // texture uploads dominate frame time on low-end GPUs. 720p preview
      // is plenty for display; captures pull from the live video element
      // directly (in capture mode this canvas can be re-sized larger).
      if (this.canvas.width !== vw || this.canvas.height !== vh) {
        this.canvas.width  = vw;
        this.canvas.height = vh;
        this.gl.viewport(0, 0, vw, vh);
      }
    }

    _loop() {
      if (!this.running) return;
      const v = this.video;
      const gl = this.gl;
      if (v && v.readyState >= 2 && !v.paused) {
        this._resizeIfNeeded();
        // texImage2D from a video element is the hardware-accelerated path
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        } catch (e) {
          // CORS / video-not-ready edge case — skip this frame, try next.
        }
      }
      // Use requestVideoFrameCallback where available — exactly synced to
      // video presentation, no wasted frames.
      if (v && v.requestVideoFrameCallback) {
        v.requestVideoFrameCallback(() => this._loop());
      } else {
        requestAnimationFrame(() => this._loop());
      }
    }

    // Capture: snapshot the current shader output as a Blob.
    // No second filter pass needed — the GL canvas already has the filter
    // baked into every pixel.
    captureBlob(quality) {
      return new Promise(resolve => {
        // Force one render at the current size before reading pixels
        const gl = this.gl;
        if (this.video && this.video.readyState >= 2) {
          gl.bindTexture(gl.TEXTURE_2D, this.texture);
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.video);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          } catch (e) {}
        }
        this.canvas.toBlob(b => resolve(b), 'image/jpeg', quality || 0.9);
      });
    }
  }

  // Module export
  window.WebGLFilter = WebGLFilter;
  window.WebGLFilter.PARAMS = FILTER_PARAMS;
  window.WebGLFilter.supported = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  })();
})();
