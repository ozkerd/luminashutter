(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))t(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&t(o)}).observe(document,{childList:!0,subtree:!0});function i(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function t(n){if(n.ep)return;n.ep=!0;const r=i(n);fetch(n.href,r)}})();const x=`#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

uniform mat3 u_transform; // Handheld stabilization counter-shift

out vec2 v_texCoord;        // Fixed stationary coordinate for accumulated buffer
out vec2 v_stabilizedCoord; // Counter-shifted coordinate for incoming video frame

void main() {
  v_texCoord = a_texCoord;
  vec3 transformed = u_transform * vec3(a_texCoord, 1.0);
  v_stabilizedCoord = transformed.xy;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`,R=`#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`,L=`#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_stabilizedCoord;

uniform sampler2D u_accumTexture;   // Accumulated frame (stationary)
uniform sampler2D u_currentTexture; // Incoming camera frame
uniform float u_frameIndex;
uniform float u_trailSensitivity;

out vec4 fragColor;

float getLuminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 uv = v_texCoord;
  vec2 currUv = clamp(v_stabilizedCoord, 0.0, 1.0);

  vec4 currColor = texture(u_currentTexture, currUv);

  if (u_frameIndex < 1.0) {
    fragColor = currColor;
    return;
  }

  vec4 accumColor = texture(u_accumTexture, uv);

  float currLum = getLuminance(currColor.rgb);
  float accumLum = getLuminance(accumColor.rgb);

  // Max-luminance blending: bright car headlights, taillights, and fireworks
  // are retained permanently. When lights pass, dark road preserves the bright trails.
  vec3 trail = max(accumColor.rgb, currColor.rgb);

  if (currLum > accumLum) {
    fragColor = vec4(trail, 1.0);
  } else {
    fragColor = accumColor;
  }
}
`,P=`#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_stabilizedCoord;

uniform sampler2D u_accumTexture;
uniform sampler2D u_currentTexture;
uniform float u_frameIndex;

out vec4 fragColor;

void main() {
  vec2 uv = v_texCoord;
  vec2 currUv = clamp(v_stabilizedCoord, 0.0, 1.0);

  vec4 currColor = texture(u_currentTexture, currUv);

  if (u_frameIndex < 1.0) {
    fragColor = currColor;
    return;
  }

  vec4 accumColor = texture(u_accumTexture, uv);

  // Progressive temporal average: C_new = (C_old * N + C_curr) / (N + 1)
  float n = min(u_frameIndex + 1.0, 240.0);
  float alpha = 1.0 / n;

  vec3 blended = mix(accumColor.rgb, currColor.rgb, alpha);
  fragColor = vec4(blended, 1.0);
}
`,_=`#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_stabilizedCoord;

uniform sampler2D u_accumTexture;
uniform sampler2D u_currentTexture;
uniform float u_frameIndex;
uniform float u_sensitivity;

out vec4 fragColor;

float colorDist(vec3 c1, vec3 c2) {
  vec3 diff = c1 - c2;
  return dot(diff, diff);
}

void main() {
  vec2 uv = v_texCoord;
  vec2 currUv = clamp(v_stabilizedCoord, 0.0, 1.0);

  vec4 currColor = texture(u_currentTexture, currUv);

  if (u_frameIndex < 1.0) {
    fragColor = currColor;
    return;
  }

  vec4 accumColor = texture(u_accumTexture, uv);

  // Squared Euclidean distance in RGB color space
  float dist = colorDist(currColor.rgb, accumColor.rgb);

  // Threshold for classifying moving pedestrians
  float motionThreshold = mix(0.015, 0.06, u_sensitivity);

  if (dist > motionThreshold) {
    // Pedestrian is passing over this pixel!
    // Reject the moving pedestrian and retain the stationary architectural background!
    fragColor = accumColor;
  } else {
    // Stationary background pixel: gently adapt to subtle ambient illumination
    vec3 background = mix(accumColor.rgb, currColor.rgb, 0.025);
    fragColor = vec4(background, 1.0);
  }
}
`,w=`#version 300 es
precision highp float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_ev;
uniform int u_colorProfile;
uniform float u_vignette;

out vec4 fragColor;

vec3 adjustContrast(vec3 color, float contrast) {
  return (color - 0.5) * contrast + 0.5;
}

vec3 adjustSaturation(vec3 color, float sat) {
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(lum), color, sat);
}

void main() {
  vec4 tex = texture(u_texture, v_texCoord);
  vec3 rgb = tex.rgb;

  // 1. Exposure Compensation (EV)
  rgb *= pow(2.0, u_ev);

  // 2. Color Profiles
  if (u_colorProfile == 0) {
    // LEICA CLASSIC
    rgb = adjustContrast(rgb, 1.12);
    rgb = adjustSaturation(rgb, 1.05);
    rgb.r += smoothstep(0.5, 1.0, rgb.r) * 0.02;
    rgb.b -= smoothstep(0.5, 1.0, rgb.b) * 0.015;
  } else if (u_colorProfile == 1) {
    // HASSELBLAD NATURAL
    rgb = adjustContrast(rgb, 1.03);
    rgb = adjustSaturation(rgb, 1.02);
    rgb = rgb / (rgb + 0.1) * 1.1;
  } else if (u_colorProfile == 2) {
    // MONOCHROM
    float mono = dot(rgb, vec3(0.35, 0.55, 0.10));
    mono = (mono - 0.5) * 1.25 + 0.5;
    rgb = vec3(clamp(mono, 0.0, 1.0));
  } else if (u_colorProfile == 3) {
    // VIVID
    rgb = adjustContrast(rgb, 1.15);
    rgb = adjustSaturation(rgb, 1.30);
  }

  // 3. Vignette
  if (u_vignette > 0.01) {
    vec2 coord = (v_texCoord - 0.5) * 2.0;
    float dist = length(coord);
    float vig = smoothstep(1.3, 0.6, dist);
    rgb *= mix(1.0, vig, u_vignette * 0.35);
  }

  fragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;class I{gl;canvas;quadVAO=null;quadVBO=null;lightTrailsProgram;silkyWaterProgram;crowdEraserProgram;displayProgram;currentFrameTexture=null;rawBeforeTexture=null;fboPing=null;fboPong=null;isPingSource=!0;width=1280;height=720;supportsFloat=!1;constructor(e){this.canvas=e;const i=e.getContext("webgl2",{alpha:!1,antialias:!1,depth:!1,preserveDrawingBuffer:!0,powerPreference:"high-performance"});if(!i)throw new Error("WebGL 2.0 is required for computational photography pipeline.");this.gl=i,this.supportsFloat=!!(i.getExtension("EXT_color_buffer_float")||i.getExtension("EXT_color_buffer_half_float")),this.lightTrailsProgram=this.createProgram(x,L),this.silkyWaterProgram=this.createProgram(x,P),this.crowdEraserProgram=this.createProgram(x,_),this.displayProgram=this.createProgram(R,w),this.initQuad(),this.initTextures()}createShader(e,i){const t=this.gl,n=t.createShader(e);if(!n)throw new Error("Failed to create shader");if(t.shaderSource(n,i.trim()),t.compileShader(n),!t.getShaderParameter(n,t.COMPILE_STATUS)){const r=t.getShaderInfoLog(n);throw t.deleteShader(n),new Error(`Shader compilation error: ${r}`)}return n}createProgram(e,i){const t=this.gl,n=this.createShader(t.VERTEX_SHADER,e),r=this.createShader(t.FRAGMENT_SHADER,i),o=t.createProgram();if(!o)throw new Error("Failed to create program");if(t.attachShader(o,n),t.attachShader(o,r),t.linkProgram(o),!t.getProgramParameter(o,t.LINK_STATUS)){const s=t.getProgramInfoLog(o);throw t.deleteProgram(o),new Error(`Program link error: ${s}`)}return t.deleteShader(n),t.deleteShader(r),o}initQuad(){const e=this.gl,i=new Float32Array([-1,-1,0,0,1,-1,1,0,-1,1,0,1,-1,1,0,1,1,-1,1,0,1,1,1,1]);this.quadVAO=e.createVertexArray(),e.bindVertexArray(this.quadVAO),this.quadVBO=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,this.quadVBO),e.bufferData(e.ARRAY_BUFFER,i,e.STATIC_DRAW),e.enableVertexAttribArray(0),e.vertexAttribPointer(0,2,e.FLOAT,!1,4*4,0),e.enableVertexAttribArray(1),e.vertexAttribPointer(1,2,e.FLOAT,!1,4*4,2*4),e.bindVertexArray(null)}initTextures(){const e=this.gl;this.currentFrameTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this.currentFrameTexture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),this.rawBeforeTexture=e.createTexture(),e.bindTexture(e.TEXTURE_2D,this.rawBeforeTexture),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),this.resizeBuffers(this.width,this.height)}createFBO(e,i){const t=this.gl,n=t.createFramebuffer();if(!n)throw new Error("Failed to create framebuffer");const r=t.createTexture();if(!r)throw new Error("Failed to create FBO texture");t.bindTexture(t.TEXTURE_2D,r),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR);const o=this.supportsFloat?t.RGBA16F:t.RGBA8,s=this.supportsFloat?t.HALF_FLOAT:t.UNSIGNED_BYTE;return t.texImage2D(t.TEXTURE_2D,0,o,e,i,0,t.RGBA,s,null),t.bindFramebuffer(t.FRAMEBUFFER,n),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,r,0),t.checkFramebufferStatus(t.FRAMEBUFFER)!==t.FRAMEBUFFER_COMPLETE&&t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,e,i,0,t.RGBA,t.UNSIGNED_BYTE,null),t.bindFramebuffer(t.FRAMEBUFFER,null),{framebuffer:n,texture:r,width:e,height:i}}resizeBuffers(e,i){if(this.width===e&&this.height===i&&this.fboPing&&this.fboPong)return;this.width=e,this.height=i;const t=this.gl;this.fboPing&&(t.deleteFramebuffer(this.fboPing.framebuffer),t.deleteTexture(this.fboPing.texture)),this.fboPong&&(t.deleteFramebuffer(this.fboPong.framebuffer),t.deleteTexture(this.fboPong.texture)),this.fboPing=this.createFBO(e,i),this.fboPong=this.createFBO(e,i),this.resetAccumulation()}resetAccumulation(){this.isPingSource=!0;const e=this.gl;this.fboPing&&(e.bindFramebuffer(e.FRAMEBUFFER,this.fboPing.framebuffer),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT)),this.fboPong&&(e.bindFramebuffer(e.FRAMEBUFFER,this.fboPong.framebuffer),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT)),e.bindFramebuffer(e.FRAMEBUFFER,null)}snapshotBeforeFrame(e){const i=this.gl;i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!0),i.bindTexture(i.TEXTURE_2D,this.rawBeforeTexture),i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e)}accumulateFrame(e,i,t,n){const r=this.gl;if(!this.fboPing||!this.fboPong||!this.quadVAO)return;r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,!0),r.activeTexture(r.TEXTURE1),r.bindTexture(r.TEXTURE_2D,this.currentFrameTexture),r.texImage2D(r.TEXTURE_2D,0,r.RGBA,r.RGBA,r.UNSIGNED_BYTE,e),t===0&&this.snapshotBeforeFrame(e);let o=this.silkyWaterProgram;i==="LIGHT_TRAILS"?o=this.lightTrailsProgram:i==="CROWD_ERASER"&&(o=this.crowdEraserProgram),r.useProgram(o);const s=Math.cos(n.angle),a=Math.sin(n.angle),l=n.dx,c=n.dy,g=s,u=-a,m=-.5*s+.5*a+.5+l,E=a,p=s,b=-.5*a-.5*s+.5+c,y=new Float32Array([g,E,0,u,p,0,m,b,1]),S=r.getUniformLocation(o,"u_transform");S&&r.uniformMatrix3fv(S,!1,y);const d=r.getUniformLocation(o,"u_frameIndex");d&&r.uniform1f(d,t);const v=r.getUniformLocation(o,"u_sensitivity");v&&r.uniform1f(v,.5);const T=r.getUniformLocation(o,"u_trailSensitivity");T&&r.uniform1f(T,.5);const A=this.isPingSource?this.fboPing:this.fboPong,C=this.isPingSource?this.fboPong:this.fboPing;r.activeTexture(r.TEXTURE0),r.bindTexture(r.TEXTURE_2D,A.texture),r.uniform1i(r.getUniformLocation(o,"u_accumTexture"),0),r.uniform1i(r.getUniformLocation(o,"u_currentTexture"),1),r.bindFramebuffer(r.FRAMEBUFFER,C.framebuffer),r.viewport(0,0,this.width,this.height),r.bindVertexArray(this.quadVAO),r.drawArrays(r.TRIANGLES,0,6),this.isPingSource=!this.isPingSource,r.bindFramebuffer(r.FRAMEBUFFER,null)}renderToCanvas(e,i=!1){const t=this.gl;if(!this.fboPing||!this.fboPong||!this.quadVAO)return;t.useProgram(this.displayProgram);const n=this.isPingSource?this.fboPing:this.fboPong,r=i?this.rawBeforeTexture??n.texture:n.texture;t.activeTexture(t.TEXTURE0),t.bindTexture(t.TEXTURE_2D,r),t.uniform1i(t.getUniformLocation(this.displayProgram,"u_texture"),0),t.uniform1f(t.getUniformLocation(this.displayProgram,"u_ev"),e.ev);let o=0;e.colorProfile==="HASSELBLAD_NATURAL"?o=1:e.colorProfile==="MONOCHROM"?o=2:e.colorProfile==="VIVID"&&(o=3),t.uniform1i(t.getUniformLocation(this.displayProgram,"u_colorProfile"),o),t.uniform1f(t.getUniformLocation(this.displayProgram,"u_vignette"),.25),t.bindFramebuffer(t.FRAMEBUFFER,null),t.viewport(0,0,this.canvas.width,this.canvas.height),t.bindVertexArray(this.quadVAO),t.drawArrays(t.TRIANGLES,0,6)}computeHistogram(e=8){const i=this.gl,t=new Uint32Array(256),n=new Uint32Array(256),r=new Uint32Array(256),o=Math.min(320,Math.floor(this.width/4)),s=Math.min(180,Math.floor(this.height/4)),a=this.isPingSource?this.fboPing:this.fboPong;if(!a)return{r:t,g:n,b:r,max:1};i.bindFramebuffer(i.FRAMEBUFFER,a.framebuffer);const l=new Uint8Array(o*s*4);i.readPixels(0,0,o,s,i.RGBA,i.UNSIGNED_BYTE,l),i.bindFramebuffer(i.FRAMEBUFFER,null);let c=1;const g=o*s;for(let u=0;u<g;u+=e){const m=u*4,E=l[m],p=l[m+1],b=l[m+2];t[E]++,n[p]++,r[b]++,t[E]>c&&(c=t[E]),n[p]>c&&(c=n[p]),r[b]>c&&(c=r[b])}return{r:t,g:n,b:r,max:c}}captureResultDataUrls(e){this.renderToCanvas(e,!0);const i=this.canvas.toDataURL("image/jpeg",.95);this.renderToCanvas(e,!1);const t=this.canvas.toDataURL("image/jpeg",.95);return{beforeUrl:i,afterUrl:t}}destroy(){const e=this.gl;this.quadVAO&&e.deleteVertexArray(this.quadVAO),this.quadVBO&&e.deleteBuffer(this.quadVBO),this.fboPing&&(e.deleteFramebuffer(this.fboPing.framebuffer),e.deleteTexture(this.fboPing.texture)),this.fboPong&&(e.deleteFramebuffer(this.fboPong.framebuffer),e.deleteTexture(this.fboPong.texture)),this.currentFrameTexture&&e.deleteTexture(this.currentFrameTexture),this.rawBeforeTexture&&e.deleteTexture(this.rawBeforeTexture),e.deleteProgram(this.lightTrailsProgram),e.deleteProgram(this.silkyWaterProgram),e.deleteProgram(this.crowdEraserProgram),e.deleteProgram(this.displayProgram)}}class M{canvas;ctx;width;height;cars=[];waterParticles=[];pedestrians=[];lastTime=0;constructor(e=1280,i=720){this.width=e,this.height=i,this.canvas=document.createElement("canvas"),this.canvas.width=e,this.canvas.height=i;const t=this.canvas.getContext("2d",{alpha:!1});if(!t)throw new Error("2D context not available for synthetic generator");this.ctx=t,this.initEntities()}getCanvas(){return this.canvas}initEntities(){this.cars=[];for(let i=0;i<28;i++){const t=Math.random()>.5;this.cars.push({x:Math.random()*this.width,y:t?this.height*.58+i%3*22:this.height*.72+i%3*22,speed:(t?1:-1)*(180+Math.random()*120),lane:i%3,isHeadlight:t,length:24+Math.random()*16,color:t?"#FFF8E7":"#FF2A2A"})}this.waterParticles=[];for(let i=0;i<350;i++)this.waterParticles.push({x:this.width*.42+Math.random()*(this.width*.16),y:this.height*.1+Math.random()*(this.height*.8),vx:(Math.random()-.5)*30,vy:240+Math.random()*320,size:2+Math.random()*4,alpha:.6+Math.random()*.4});this.pedestrians=[];const e=["#E63946","#F1FAEE","#A8DADC","#457B9D","#1D3557","#F4A261","#E76F51","#9B5DE5"];for(let i=0;i<32;i++)this.pedestrians.push({x:Math.random()*this.width,y:this.height*.45+Math.random()*(this.height*.45),targetX:Math.random()*this.width,targetY:this.height*.45+Math.random()*(this.height*.45),speed:25+Math.random()*45,color:e[i%e.length],size:14+Math.random()*8})}update(e,i){this.lastTime===0&&(this.lastTime=i);const t=Math.min((i-this.lastTime)/1e3,.1);this.lastTime=i;const n=this.ctx,r=this.width,o=this.height;switch(e){case"SIM_TRAFFIC":this.renderNightTraffic(n,r,o,t);break;case"SIM_WATERFALL":this.renderWaterfall(n,r,o,t);break;case"SIM_PLAZA":this.renderPlaza(n,r,o,t);break}}renderNightTraffic(e,i,t,n){const r=e.createLinearGradient(0,0,0,t);r.addColorStop(0,"#05070D"),r.addColorStop(.5,"#0B0F1A"),r.addColorStop(1,"#080A0F"),e.fillStyle=r,e.fillRect(0,0,i,t),e.fillStyle="#06080F";const o=[60,90,75,110,85,130,95,70,100,80,120,90,140];let s=0;for(let a=0;a<o.length&&s<i;a++){const l=o[a],c=180+a*37%160;e.fillRect(s,t*.52-c,l,c),e.fillStyle="#FFDD80";for(let g=t*.52-c+15;g<t*.5;g+=20)for(let u=s+10;u<s+l-10;u+=16)(u*g+a)%7>2&&(e.globalAlpha=.4+(u+g)%5*.1,e.fillRect(u,g,6,8));e.fillStyle="#06080F",e.globalAlpha=1,s+=l+8}e.fillStyle="#101217",e.beginPath(),e.moveTo(0,t*.55),e.bezierCurveTo(i*.35,t*.54,i*.65,t*.58,i,t*.55),e.lineTo(i,t*.88),e.bezierCurveTo(i*.65,t*.9,i*.35,t*.86,0,t*.88),e.closePath(),e.fill(),e.strokeStyle="#3A3F4D",e.lineWidth=2,e.setLineDash([16,24]),e.beginPath(),e.moveTo(0,t*.68),e.bezierCurveTo(i*.35,t*.67,i*.65,t*.71,i,t*.68),e.stroke(),e.setLineDash([]);for(const a of this.cars)if(a.x+=a.speed*n,a.speed>0&&a.x>i+60&&(a.x=-60),a.speed<0&&a.x<-60&&(a.x=i+60),e.fillStyle="#181A20",e.fillRect(a.x-a.length*.5,a.y-7,a.length,14),a.isHeadlight){const l=e.createRadialGradient(a.x+a.length*.5,a.y,2,a.x+a.length*.5+20,a.y,45);l.addColorStop(0,"rgba(255, 250, 230, 1.0)"),l.addColorStop(.3,"rgba(255, 220, 140, 0.6)"),l.addColorStop(1,"rgba(255, 200, 100, 0.0)"),e.fillStyle=l,e.beginPath(),e.arc(a.x+a.length*.5+8,a.y,35,-Math.PI*.4,Math.PI*.4),e.fill(),e.fillStyle="#FFFFFF",e.fillRect(a.x+a.length*.5-2,a.y-5,4,3),e.fillRect(a.x+a.length*.5-2,a.y+2,4,3)}else{const l=e.createRadialGradient(a.x-a.length*.5,a.y,2,a.x-a.length*.5-12,a.y,32);l.addColorStop(0,"rgba(255, 40, 40, 1.0)"),l.addColorStop(.4,"rgba(220, 10, 10, 0.5)"),l.addColorStop(1,"rgba(180, 0, 0, 0.0)"),e.fillStyle=l,e.beginPath(),e.arc(a.x-a.length*.5-4,a.y,25,Math.PI*.6,Math.PI*1.4),e.fill(),e.fillStyle="#FF4D4D",e.fillRect(a.x-a.length*.5-2,a.y-5,4,3),e.fillRect(a.x-a.length*.5-2,a.y+2,4,3)}}renderWaterfall(e,i,t,n){const r=e.createLinearGradient(0,0,0,t*.4);r.addColorStop(0,"#5A7282"),r.addColorStop(1,"#8FA6B5"),e.fillStyle=r,e.fillRect(0,0,i,t*.4),e.fillStyle="#2A3036",e.beginPath(),e.moveTo(0,0),e.lineTo(i*.42,0),e.lineTo(i*.4,t*.35),e.lineTo(i*.37,t*.75),e.lineTo(i*.3,t),e.lineTo(0,t),e.closePath(),e.fill(),e.fillStyle="#23282D",e.beginPath(),e.moveTo(i,0),e.lineTo(i*.6,0),e.lineTo(i*.62,t*.35),e.lineTo(i*.64,t*.7),e.lineTo(i*.72,t),e.lineTo(i,t),e.closePath(),e.fill(),e.fillStyle="#18241D";for(let s=20;s<i*.36;s+=45)this.drawPineTree(e,s,t*.28+s*17%60,30);for(let s=i*.66;s<i-20;s+=50)this.drawPineTree(e,s,t*.26+s*23%70,32);e.fillStyle="#1A2933",e.fillRect(i*.4,0,i*.21,t*.85);for(const s of this.waterParticles)s.y+=s.vy*n,s.x+=s.vx*n,s.vx+=(Math.random()-.5)*40*n,s.y>t*.82&&(s.y=t*.05+Math.random()*30,s.x=i*.41+Math.random()*(i*.18),s.vx=(Math.random()-.5)*20),e.fillStyle=`rgba(235, 245, 255, ${s.alpha})`,e.fillRect(s.x,s.y,s.size,s.size*3.5);const o=e.createLinearGradient(0,t*.78,0,t);o.addColorStop(0,"#264253"),o.addColorStop(1,"#162833"),e.fillStyle=o,e.fillRect(0,t*.8,i,t*.2),e.fillStyle="rgba(255, 255, 255, 0.45)";for(let s=0;s<16;s++){const a=i*.38+s*18+Math.sin(this.lastTime*.005+s)*12,l=t*.81+Math.cos(this.lastTime*.006+s)*8;e.beginPath(),e.ellipse(a,l,28,10,0,0,Math.PI*2),e.fill()}}drawPineTree(e,i,t,n){e.beginPath(),e.moveTo(i,t-n),e.lineTo(i+n*.4,t),e.lineTo(i-n*.4,t),e.closePath(),e.fill()}renderPlaza(e,i,t,n){const r=e.createLinearGradient(0,0,0,t*.5);r.addColorStop(0,"#4A6984"),r.addColorStop(.7,"#D4A373"),r.addColorStop(1,"#FAEDCD"),e.fillStyle=r,e.fillRect(0,0,i,t*.5),e.fillStyle="#C2B69D",e.fillRect(i*.15,t*.18,i*.7,t*.32),e.fillStyle="#8C7B65";for(let s=i*.18;s<i*.82;s+=42)e.fillRect(s,t*.25,14,t*.25);e.fillStyle="#A3927A",e.beginPath(),e.moveTo(i*.5,t*.08),e.lineTo(i*.68,t*.18),e.lineTo(i*.32,t*.18),e.closePath(),e.fill();const o=e.createLinearGradient(0,t*.5,0,t);o.addColorStop(0,"#6C584C"),o.addColorStop(1,"#4A3B32"),e.fillStyle=o,e.fillRect(0,t*.5,i,t*.5),e.fillStyle="#54463C",e.beginPath(),e.ellipse(i*.5,t*.72,85,28,0,0,Math.PI*2),e.fill(),e.fillStyle="#8AB0AB",e.beginPath(),e.ellipse(i*.5,t*.72,70,20,0,0,Math.PI*2),e.fill();for(const s of this.pedestrians){const a=s.targetX-s.x,l=s.targetY-s.y,c=Math.hypot(a,l);c<8?(s.targetX=Math.random()*i,s.targetY=t*.52+Math.random()*(t*.42)):(s.x+=a/c*s.speed*n,s.y+=l/c*s.speed*n),e.fillStyle="rgba(20, 15, 10, 0.4)",e.beginPath(),e.ellipse(s.x,s.y+s.size*.45,s.size*.5,s.size*.2,0,0,Math.PI*2),e.fill(),e.fillStyle=s.color,e.beginPath(),e.arc(s.x,s.y-s.size*.5,s.size*.22,0,Math.PI*2),e.fill(),e.fillRect(s.x-s.size*.2,s.y-s.size*.3,s.size*.4,s.size*.65)}}}class F{activeSource="SIM_TRAFFIC";videoElement=null;mediaStream=null;syntheticGenerator;isCameraAvailable=!1;torchEnabled=!1;constructor(){this.syntheticGenerator=new M(1280,720),this.initVideoElement()}initVideoElement(){const e=document.createElement("video");e.autoplay=!0,e.muted=!0,e.playsInline=!0,this.videoElement=e}async setInputSource(e){this.activeSource=e,e==="LIVE_CAMERA"?await this.startLiveCamera():this.stopLiveCamera()}getActiveSource(){return this.activeSource}async startLiveCamera(){if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return console.warn("getUserMedia not supported on this platform. Falling back to simulation."),this.activeSource="SIM_TRAFFIC",!1;try{this.stopLiveCamera();const e={audio:!1,video:{facingMode:{ideal:"environment"},width:{ideal:1920,min:1280},height:{ideal:1080,min:720},frameRate:{ideal:60,min:30}}},i=await navigator.mediaDevices.getUserMedia(e);return this.mediaStream=i,this.videoElement&&(this.videoElement.srcObject=i,await this.videoElement.play()),this.isCameraAvailable=!0,this.activeSource="LIVE_CAMERA",!0}catch(e){return console.warn("Could not access live camera. Defaulting to high-res simulation.",e),this.isCameraAvailable=!1,this.activeSource="SIM_TRAFFIC",!1}}stopLiveCamera(){this.mediaStream&&(this.mediaStream.getTracks().forEach(e=>e.stop()),this.mediaStream=null),this.videoElement&&(this.videoElement.srcObject=null),this.torchEnabled=!1}async toggleTorch(e){if(!this.mediaStream)return!1;const i=this.mediaStream.getVideoTracks()[0];if(!i)return!1;const t=e!==void 0?e:!this.torchEnabled;try{const n=i.getCapabilities?.();if(n&&n.torch)return await i.applyConstraints({advanced:[{torch:t}]}),this.torchEnabled=t,this.torchEnabled}catch(n){console.warn("Torch constraint not supported",n)}return!1}getFrameSource(e){return this.activeSource==="LIVE_CAMERA"&&this.videoElement&&this.videoElement.readyState>=2?this.videoElement:(this.syntheticGenerator.update(this.activeSource,e),this.syntheticGenerator.getCanvas())}getDimensions(){return this.activeSource==="LIVE_CAMERA"&&this.videoElement&&this.videoElement.videoWidth>0?{width:this.videoElement.videoWidth,height:this.videoElement.videoHeight}:{width:1280,height:720}}getIsCameraAvailable(){return this.isCameraAvailable}destroy(){this.stopLiveCamera()}}class D{mode="AI_OPTICAL";gyroAvailable=!1;currentGyroAngle=0;currentGyroDx=0;currentGyroDy=0;filteredDx=0;filteredDy=0;filteredAngle=0;constructor(){this.initSensors()}initSensors(){typeof window<"u"&&"DeviceMotionEvent"in window&&window.addEventListener("devicemotion",e=>{if(!e.rotationRate)return;this.gyroAvailable=!0;const i=e.rotationRate.alpha??0,t=e.rotationRate.beta??0,n=e.rotationRate.gamma??0,r=4e-4;this.currentGyroAngle=n*Math.PI/180*.1,this.currentGyroDx=t*r,this.currentGyroDy=i*r},{passive:!0})}setMode(e){this.mode=e}getMode(){return this.mode}isGyroSupported(){return this.gyroAvailable}reset(){this.filteredDx=0,this.filteredDy=0,this.filteredAngle=0}computeOffset(e,i){if(this.mode==="OFF"||!this.gyroAvailable)return{dx:0,dy:0,angle:0,confidence:.99};const t=this.currentGyroDx,n=this.currentGyroDy,r=this.currentGyroAngle,o=i?-1:-.8,s=.85;this.filteredDx=this.filteredDx*s+t*o*(1-s),this.filteredDy=this.filteredDy*s+n*o*(1-s),this.filteredAngle=this.filteredAngle*s+r*o*(1-s);const a=Math.hypot(this.filteredDx,this.filteredDy)*100,l=Math.max(.92,Math.min(.999,1-a*.05));return{dx:this.filteredDx,dy:this.filteredDy,angle:this.filteredAngle,confidence:l}}}class B{pipeline;cameraManager;stabilizer;state="IDLE";mode="LIGHT_TRAILS";duration=3;settings={ev:0,iso:"AUTO",focusLocked:!1,torch:!1,stabilization:"AI_OPTICAL",grid:!0,colorProfile:"LEICA_CLASSIC"};isRunning=!1;animFrameId=null;exposureStartTime=0;targetDurationMs=3e3;frameCount=0;lastFpsCalcTime=0;currentFps=60;frameDeltaCounter=0;lastHistogramTime=0;onProgressListeners=new Set;onResultListeners=new Set;onHistogramListeners=new Set;constructor(e){this.pipeline=new I(e),this.cameraManager=new F,this.stabilizer=new D,this.startLoop()}getCameraManager(){return this.cameraManager}getStabilizer(){return this.stabilizer}getSettings(){return this.settings}updateSettings(e){this.settings={...this.settings,...e},e.stabilization&&this.stabilizer.setMode(e.stabilization),e.torch!==void 0&&this.cameraManager.toggleTorch(e.torch).catch(()=>{})}setMode(e){this.state!=="EXPOSING"&&(this.mode=e,this.pipeline.resetAccumulation())}getMode(){return this.mode}setDuration(e){this.state!=="EXPOSING"&&(this.duration=e)}getDuration(){return this.duration}getState(){return this.state}subscribeProgress(e){return this.onProgressListeners.add(e),()=>this.onProgressListeners.delete(e)}subscribeResult(e){return this.onResultListeners.add(e),()=>this.onResultListeners.delete(e)}subscribeHistogram(e){return this.onHistogramListeners.add(e),()=>this.onHistogramListeners.delete(e)}startExposure(){if(this.state==="EXPOSING"){this.duration==="BULB"&&this.finishExposure();return}this.state="EXPOSING",this.frameCount=0,this.exposureStartTime=performance.now(),this.pipeline.resetAccumulation(),this.stabilizer.reset(),this.duration==="BULB"?this.targetDurationMs=0:this.targetDurationMs=this.duration*1e3}stopExposure(){this.state==="EXPOSING"&&this.finishExposure()}finishExposure(){this.state="PROCESSING";const e=(performance.now()-this.exposureStartTime)/1e3;requestAnimationFrame(()=>{const{width:i,height:t}=this.cameraManager.getDimensions(),{beforeUrl:n,afterUrl:r}=this.pipeline.captureResultDataUrls(this.settings),o={id:`lumina_${Date.now()}`,timestamp:Date.now(),mode:this.mode,durationSeconds:Number(e.toFixed(1)),frameCount:Math.max(1,this.frameCount),beforeDataUrl:n,afterDataUrl:r,width:i,height:t,settings:{...this.settings}};this.state="COMPLETED",this.onResultListeners.forEach(s=>s(o)),setTimeout(()=>{this.state="IDLE",this.pipeline.resetAccumulation()},500)})}startLoop(){this.isRunning=!0;const e=i=>{if(!this.isRunning)return;this.frameDeltaCounter++,i-this.lastFpsCalcTime>=1e3&&(this.currentFps=this.frameDeltaCounter,this.frameDeltaCounter=0,this.lastFpsCalcTime=i);const t=this.cameraManager.getFrameSource(i),n=this.state==="EXPOSING",r=this.stabilizer.computeOffset(i,n);if(n){this.pipeline.accumulateFrame(t,this.mode,this.frameCount,r),this.frameCount++;const o=i-this.exposureStartTime,s=o/1e3;let a=0;this.targetDurationMs>0?a=Math.min(100,o/this.targetDurationMs*100):a=s%1*100;const l={state:this.state,mode:this.mode,targetSeconds:this.duration==="BULB"?0:this.duration,elapsedSeconds:Number(s.toFixed(1)),progressPercent:a,frameCount:this.frameCount,fps:this.currentFps};this.onProgressListeners.forEach(c=>c(l)),this.pipeline.renderToCanvas(this.settings,!1),this.targetDurationMs>0&&o>=this.targetDurationMs&&this.finishExposure()}else this.pipeline.accumulateFrame(t,this.mode,0,r),this.pipeline.renderToCanvas(this.settings,!1);if(i-this.lastHistogramTime>80&&this.onHistogramListeners.size>0){this.lastHistogramTime=i;const o=this.pipeline.computeHistogram(12);this.onHistogramListeners.forEach(s=>s(o))}this.animFrameId=requestAnimationFrame(e)};this.animFrameId=requestAnimationFrame(e)}destroy(){this.isRunning=!1,this.animFrameId!==null&&cancelAnimationFrame(this.animFrameId),this.pipeline.destroy(),this.cameraManager.destroy(),this.onProgressListeners.clear(),this.onResultListeners.clear(),this.onHistogramListeners.clear()}}const h={flashOn:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',flashOff:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>',grid:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',gyro:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',film:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>',info:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',close:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',download:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',share:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',sliders:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',lightTrails:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',silkyWater:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',crowdEraser:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'};class O{container;engine;onOpenPricing;isEvDrawerOpen=!1;constructor(e,i){this.engine=e,this.onOpenPricing=i,this.container=document.createElement("div"),this.render()}getElement(){return this.container}render(){const e=this.engine.getSettings();this.container.innerHTML=`
      <div class="header-bar">
        <div class="brand-badge">
          <div class="brand-dot"></div>
          <span class="brand-text">LUMINA</span>
          <span class="brand-price-tag" id="btnPricingBadge">$2.49 LIFETIME</span>
        </div>

        <div class="header-controls">
          <button class="btn-icon-hdr ${e.torch?"active":""}" id="btnTorch" title="Flash / Torch">
            ${e.torch?h.flashOn:h.flashOff}
          </button>
          <button class="btn-icon-hdr ${e.grid?"active":""}" id="btnGrid" title="Composition Grid">
            ${h.grid}
          </button>
          <button class="btn-icon-hdr ${e.stabilization!=="OFF"?"active":""}" id="btnStabilizer" title="Handheld Anti-Shake">
            ${h.gyro}
          </button>
          <button class="btn-icon-hdr" id="btnPricing" title="App Info & Pricing">
            ${h.info}
          </button>
        </div>
      </div>

      <div class="quick-controls">
        <div class="quick-control-item" id="btnEvToggle" title="Exposure Value (EV)">
          <span>EV</span>
          <span class="quick-val" id="evDisplay">${e.ev>=0?`+${e.ev.toFixed(1)}`:e.ev.toFixed(1)}</span>
        </div>

        <div class="quick-control-item" id="btnIsoToggle" title="ISO Sensitivity">
          <span>ISO</span>
          <span class="quick-val" id="isoDisplay">${e.iso}</span>
        </div>

        <div class="quick-control-item" id="btnProfileToggle" title="Color Profile">
          <span class="quick-val" id="profileDisplay">${this.formatProfileName(e.colorProfile)}</span>
        </div>

        <select class="scenario-select" id="scenarioSelect" title="Input Stream Source">
          <option value="SIM_TRAFFIC">Highway (Night)</option>
          <option value="SIM_WATERFALL">Waterfall (Rapid)</option>
          <option value="SIM_PLAZA">Plaza (Crowd)</option>
          <option value="LIVE_CAMERA">Device Camera</option>
        </select>
      </div>

      <div class="drawer-slider" id="evDrawer">
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); width: 44px;">-2.0 EV</span>
        <input type="range" class="ev-input" id="evSlider" min="-2.0" max="2.0" step="0.1" value="${e.ev}" />
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); width: 44px; text-align: right;">+2.0 EV</span>
      </div>
    `,this.attachEvents()}formatProfileName(e){switch(e){case"LEICA_CLASSIC":return"LEICA M";case"HASSELBLAD_NATURAL":return"HASSELBLAD";case"MONOCHROM":return"MONO";case"VIVID":return"VIVID"}}attachEvents(){const e=this.container.querySelector("#btnPricingBadge"),i=this.container.querySelector("#btnPricing");e?.addEventListener("click",()=>this.onOpenPricing()),i?.addEventListener("click",()=>this.onOpenPricing());const t=this.container.querySelector("#btnTorch");t?.addEventListener("click",()=>{const d=this.engine.getSettings().torch;this.engine.updateSettings({torch:!d}),t.classList.toggle("active",!d),t.innerHTML=d?h.flashOff:h.flashOn});const n=this.container.querySelector("#btnGrid");n?.addEventListener("click",()=>{const d=this.engine.getSettings().grid;this.engine.updateSettings({grid:!d}),n.classList.toggle("active",!d);const v=document.querySelector(".grid-lines");v&&v.classList.toggle("hidden",d)});const r=this.container.querySelector("#btnStabilizer");r?.addEventListener("click",()=>{const v=this.engine.getSettings().stabilization==="AI_OPTICAL"?"OFF":"AI_OPTICAL";this.engine.updateSettings({stabilization:v}),r.classList.toggle("active",v!=="OFF");const T=document.querySelector("#stabBadge");T&&(T.innerText=v==="AI_OPTICAL"?"AI OPTICAL LOCKED":"STABILIZER OFF")});const o=this.container.querySelector("#btnEvToggle"),s=this.container.querySelector("#evDrawer"),a=this.container.querySelector("#evSlider"),l=this.container.querySelector("#evDisplay");o?.addEventListener("click",()=>{this.isEvDrawerOpen=!this.isEvDrawerOpen,s?.classList.toggle("open",this.isEvDrawerOpen)}),a?.addEventListener("input",()=>{const d=parseFloat(a.value);this.engine.updateSettings({ev:d}),l&&(l.innerText=d>=0?`+${d.toFixed(1)}`:d.toFixed(1))});const c=this.container.querySelector("#btnIsoToggle"),g=this.container.querySelector("#isoDisplay"),u=["AUTO",50,100,200,400,800];let m=0;c?.addEventListener("click",()=>{m=(m+1)%u.length;const d=u[m];this.engine.updateSettings({iso:d}),g&&(g.innerText=String(d))});const E=this.container.querySelector("#btnProfileToggle"),p=this.container.querySelector("#profileDisplay"),b=["LEICA_CLASSIC","HASSELBLAD_NATURAL","MONOCHROM","VIVID"];let y=0;E?.addEventListener("click",()=>{y=(y+1)%b.length;const d=b[y];this.engine.updateSettings({colorProfile:d}),p&&(p.innerText=this.formatProfileName(d))});const S=this.container.querySelector("#scenarioSelect");S?.addEventListener("change",async()=>{const d=S.value;await this.engine.getCameraManager().setInputSource(d)})}}class U{container;engine=null;canvas=null;histCanvas=null;histCtx=null;exposureOverlay=null;countdownCircle=null;countdownNumber=null;stabBadge=null;constructor(e){this.container=document.createElement("div"),this.container.className="viewfinder-container",this.render(),e&&this.bindEngine(e)}bindEngine(e){this.engine=e,this.initSubscriptions()}getElement(){return this.container}getCanvas(){if(!this.canvas)throw new Error("GL Canvas not initialized");return this.canvas}render(){this.container.innerHTML=`
      <canvas id="glCanvas" width="1280" height="720"></canvas>

      <div class="viewfinder-hud">
        <!-- Rule of thirds composition grid -->
        <div class="grid-lines">
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
          <div class="grid-cell"></div>
        </div>

        <!-- Electronic Horizon Level Indicator -->
        <div class="horizon-level level-balanced" id="horizonLevel"></div>

        <!-- Real-time Live RGB Histogram -->
        <div class="histogram-box">
          <canvas id="histCanvas" width="80" height="40"></canvas>
        </div>

        <!-- Handheld AI Stabilization Telemetry -->
        <div class="stab-telemetry">
          <div class="stab-indicator-dot"></div>
          <span id="stabBadge">AI OPTICAL LOCKED 99%</span>
        </div>
      </div>

      <!-- Live Progressive Exposure Countdown Overlay -->
      <div class="exposure-overlay" id="exposureOverlay">
        <div class="countdown-ring-box">
          <svg class="countdown-svg" viewBox="0 0 100 100">
            <circle class="countdown-circle-bg" cx="50" cy="50" r="44"></circle>
            <circle class="countdown-circle-prog" id="countdownCircle" cx="50" cy="50" r="44" stroke-dasharray="276.46" stroke-dashoffset="0"></circle>
          </svg>
          <div class="countdown-number" id="countdownNumber">3.0s</div>
        </div>
        <div class="live-forming-badge" id="liveBadge">Progressive Exposure Forming</div>
      </div>
    `,this.canvas=this.container.querySelector("#glCanvas"),this.histCanvas=this.container.querySelector("#histCanvas"),this.histCanvas&&(this.histCtx=this.histCanvas.getContext("2d")),this.exposureOverlay=this.container.querySelector("#exposureOverlay"),this.countdownCircle=this.container.querySelector("#countdownCircle"),this.countdownNumber=this.container.querySelector("#countdownNumber"),this.stabBadge=this.container.querySelector("#stabBadge")}initSubscriptions(){if(!this.engine)return;const e=2*Math.PI*44;this.engine.subscribeProgress(i=>{if(i.state==="EXPOSING"){if(this.exposureOverlay?.classList.add("active"),this.countdownCircle){const t=e*(1-i.progressPercent/100);this.countdownCircle.style.strokeDashoffset=String(t)}if(this.countdownNumber)if(i.targetSeconds>0){const t=Math.max(0,i.targetSeconds-i.elapsedSeconds);this.countdownNumber.innerText=`${t.toFixed(1)}s`}else this.countdownNumber.innerText=`${i.elapsedSeconds.toFixed(1)}s`;if(this.stabBadge){const t=Math.min(99,Math.floor(96+i.frameCount%4));this.stabBadge.innerText=`AI OPTICAL LOCKED ${t}%`}}else this.exposureOverlay?.classList.remove("active")}),this.engine.subscribeHistogram(i=>{this.renderHistogram(i)})}renderHistogram(e){if(!this.histCtx||!this.histCanvas)return;const i=this.histCtx,t=this.histCanvas.width,n=this.histCanvas.height;i.clearRect(0,0,t,n);const r=Math.max(1,e.max),o=256/t;[{hist:e.r,color:"rgba(235, 68, 90, 0.7)"},{hist:e.g,color:"rgba(45, 211, 111, 0.7)"},{hist:e.b,color:"rgba(56, 128, 255, 0.7)"}].forEach(({hist:a,color:l})=>{i.fillStyle=l,i.beginPath(),i.moveTo(0,n);for(let c=0;c<t;c++){const g=Math.min(255,Math.floor(c*o)),m=(a[g]||0)/r*n*.92;i.lineTo(c,n-m)}i.lineTo(t,n),i.closePath(),i.fill()})}}class k{container;engine;constructor(e){this.engine=e,this.container=document.createElement("div"),this.container.className="mode-dial-strip",this.render()}getElement(){return this.container}render(){const e=this.engine.getMode();this.container.innerHTML=`
      <div class="mode-tab ${e==="LIGHT_TRAILS"?"active":""}" data-mode="LIGHT_TRAILS">
        ${h.lightTrails}
        <span>LIGHT TRAILS</span>
      </div>
      <div class="mode-tab ${e==="SILKY_WATER"?"active":""}" data-mode="SILKY_WATER">
        ${h.silkyWater}
        <span>SILKY WATER</span>
      </div>
      <div class="mode-tab ${e==="CROWD_ERASER"?"active":""}" data-mode="CROWD_ERASER">
        ${h.crowdEraser}
        <span>CROWD ERASER</span>
      </div>
    `,this.attachEvents()}attachEvents(){const e=this.container.querySelectorAll(".mode-tab");e.forEach(i=>{i.addEventListener("click",async()=>{const t=i.dataset.mode;if(!t)return;this.engine.setMode(t),e.forEach(o=>o.classList.toggle("active",o===i));const n=this.engine.getCameraManager();n.getActiveSource()!=="LIVE_CAMERA"&&(t==="LIGHT_TRAILS"?(await n.setInputSource("SIM_TRAFFIC"),this.syncScenarioDropdown("SIM_TRAFFIC")):t==="SILKY_WATER"?(await n.setInputSource("SIM_WATERFALL"),this.syncScenarioDropdown("SIM_WATERFALL")):t==="CROWD_ERASER"&&(await n.setInputSource("SIM_PLAZA"),this.syncScenarioDropdown("SIM_PLAZA")))})})}syncScenarioDropdown(e){const i=document.querySelector("#scenarioSelect");i&&(i.value=e)}}class G{container;engine;onOpenLastCapture;lastResult=null;shutterRing=null;thumbImg=null;thumbEmpty=null;constructor(e,i){this.engine=e,this.onOpenLastCapture=i,this.container=document.createElement("div"),this.container.className="shutter-panel",this.render(),this.initSubscriptions()}getElement(){return this.container}setLastResult(e){this.lastResult=e,this.thumbImg&&this.thumbEmpty&&(this.thumbImg.src=e.afterDataUrl,this.thumbImg.style.display="block",this.thumbEmpty.style.display="none")}render(){const e=this.engine.getDuration();this.container.innerHTML=`
      <!-- Duration Selector: 3s | 5s | 9s | BULB -->
      <div class="duration-selector">
        <button class="duration-chip ${e===3?"active":""}" data-dur="3">3s</button>
        <button class="duration-chip ${e===5?"active":""}" data-dur="5">5s</button>
        <button class="duration-chip ${e===9?"active":""}" data-dur="9">9s</button>
        <button class="duration-chip ${e==="BULB"?"active":""}" data-dur="BULB">BULB</button>
      </div>

      <!-- Shutter Row -->
      <div class="shutter-row">
        <!-- Gallery Thumbnail -->
        <button class="btn-gallery-thumb" id="btnGallery" title="Review Last Capture">
          <img id="thumbImg" style="display: none;" alt="Last Capture" />
          <div class="thumb-empty" id="thumbEmpty">
            ${h.film}
          </div>
        </button>

        <!-- Leica Two-Stage Metallic Shutter Button -->
        <div class="shutter-outer-ring" id="shutterBtn" title="Press to Expose">
          <div class="shutter-inner-btn">
            <div class="shutter-center-dot"></div>
          </div>
        </div>

        <!-- Film / Color Profile shortcut -->
        <button class="btn-extra-ctrl" id="btnProfilesQuick" title="Color Profile">
          ${h.sliders}
        </button>
      </div>
    `,this.shutterRing=this.container.querySelector("#shutterBtn"),this.thumbImg=this.container.querySelector("#thumbImg"),this.thumbEmpty=this.container.querySelector("#thumbEmpty"),this.attachEvents()}attachEvents(){const e=this.container.querySelectorAll(".duration-chip");e.forEach(n=>{n.addEventListener("click",()=>{const r=n.dataset.dur,o=r==="BULB"?"BULB":parseInt(r||"3",10);this.engine.setDuration(o),e.forEach(s=>s.classList.toggle("active",s===n))})}),this.shutterRing?.addEventListener("click",()=>{this.engine.getState()==="EXPOSING"?this.engine.stopExposure():this.engine.startExposure()}),this.container.querySelector("#btnGallery")?.addEventListener("click",()=>{this.lastResult&&this.onOpenLastCapture()}),this.container.querySelector("#btnProfilesQuick")?.addEventListener("click",()=>{document.querySelector("#btnProfileToggle")?.click()})}initSubscriptions(){this.engine.subscribeProgress(e=>{e.state==="EXPOSING"?this.shutterRing?.classList.add("exposing"):this.shutterRing?.classList.remove("exposing")})}}class N{container;currentResult=null;isDragging=!1;beforeWrap=null;splitViewer=null;constructor(){this.container=document.createElement("div"),this.container.className="modal-backdrop",this.render()}getElement(){return this.container}open(e){this.currentResult=e,this.populateData(e),this.container.classList.add("open")}close(){this.container.classList.remove("open")}render(){this.container.innerHTML=`
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <span style="color: var(--leica-amber);">${h.film}</span>
            <span>Computational Capture Review</span>
          </div>
          <button class="modal-close-btn" id="btnCloseModal">
            ${h.close}
          </button>
        </div>

        <div class="modal-body">
          <!-- Interactive Before / After Split Slider -->
          <div class="split-viewer" id="splitViewer">
            <img class="split-img-after" id="imgAfter" alt="Long Exposure" />
            <div class="split-img-before-wrap" id="beforeWrap">
              <img class="split-img-before" id="imgBefore" alt="Raw Single Frame" />
              <div class="split-divider-handle" id="dividerHandle">❮❯</div>
            </div>
            <div class="split-tag split-tag-before">Single Shot</div>
            <div class="split-tag split-tag-after">Long Exposure</div>
          </div>

          <!-- Technical EXIF & Processing Telemetry -->
          <div class="exif-grid">
            <div class="exif-item">
              <span class="exif-label">MODE</span>
              <span class="exif-val" id="exifMode">LIGHT TRAILS</span>
            </div>
            <div class="exif-item">
              <span class="exif-label">EXPOSURE</span>
              <span class="exif-val" id="exifDuration">3.0s</span>
            </div>
            <div class="exif-item">
              <span class="exif-label">FRAMES STACKED</span>
              <span class="exif-val" id="exifFrames">180</span>
            </div>
            <div class="exif-item">
              <span class="exif-label">PROFILE</span>
              <span class="exif-val" id="exifProfile">LEICA M</span>
            </div>
            <div class="exif-item">
              <span class="exif-label">ISO / EV</span>
              <span class="exif-val" id="exifIso">AUTO / +0.0</span>
            </div>
            <div class="exif-item">
              <span class="exif-label">RESOLUTION</span>
              <span class="exif-val" id="exifRes">1280x720</span>
            </div>
          </div>

          <!-- Actions: Save full res to gallery & Share -->
          <div class="modal-actions">
            <button class="btn-primary-action" id="btnSaveGallery">
              ${h.download}
              <span>Save Full Resolution</span>
            </button>
            <button class="btn-secondary-action" id="btnShareCapture">
              ${h.share}
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>
    `,this.splitViewer=this.container.querySelector("#splitViewer"),this.beforeWrap=this.container.querySelector("#beforeWrap"),this.attachEvents()}populateData(e){const i=this.container.querySelector("#imgBefore"),t=this.container.querySelector("#imgAfter");i&&(i.src=e.beforeDataUrl),t&&(t.src=e.afterDataUrl);const n=this.container.querySelector("#exifMode"),r=this.container.querySelector("#exifDuration"),o=this.container.querySelector("#exifFrames"),s=this.container.querySelector("#exifProfile"),a=this.container.querySelector("#exifIso"),l=this.container.querySelector("#exifRes");n&&(n.innerText=e.mode.replace("_"," ")),r&&(r.innerText=`${e.durationSeconds}s`),o&&(o.innerText=`${e.frameCount} frames`),s&&(s.innerText=e.settings.colorProfile.replace("_"," ")),a&&(a.innerText=`${e.settings.iso} / ${e.settings.ev>=0?`+${e.settings.ev}`:e.settings.ev}`),l&&(l.innerText=`${e.width}x${e.height}`),this.beforeWrap&&(this.beforeWrap.style.width="50%")}attachEvents(){this.container.querySelector("#btnCloseModal")?.addEventListener("click",()=>this.close());const i=r=>{if(!this.splitViewer||!this.beforeWrap)return;const o=this.splitViewer.getBoundingClientRect(),a=Math.max(0,Math.min(o.width,r-o.left))/o.width*100;this.beforeWrap.style.width=`${a}%`};this.splitViewer?.addEventListener("mousedown",r=>{this.isDragging=!0,i(r.clientX)}),window.addEventListener("mousemove",r=>{this.isDragging&&i(r.clientX)}),window.addEventListener("mouseup",()=>{this.isDragging=!1}),this.splitViewer?.addEventListener("touchstart",r=>{this.isDragging=!0,r.touches[0]&&i(r.touches[0].clientX)},{passive:!0}),window.addEventListener("touchmove",r=>{this.isDragging&&r.touches[0]&&i(r.touches[0].clientX)},{passive:!0}),window.addEventListener("touchend",()=>{this.isDragging=!1});const t=this.container.querySelector("#btnSaveGallery");t?.addEventListener("click",()=>{if(!this.currentResult)return;const r=document.createElement("a");r.href=this.currentResult.afterDataUrl,r.download=`LuminaShutter_${this.currentResult.mode}_${this.currentResult.id}.jpg`,document.body.appendChild(r),r.click(),document.body.removeChild(r);const o=t.querySelector("span");if(o){const s=o.innerText;o.innerText="Saved to Photos!",setTimeout(()=>{o.innerText=s},2e3)}});const n=this.container.querySelector("#btnShareCapture");n?.addEventListener("click",async()=>{if(this.currentResult)if(navigator.share)try{const r=await(await fetch(this.currentResult.afterDataUrl)).blob(),o=new File([r],`LuminaShutter_${this.currentResult.id}.jpg`,{type:"image/jpeg"});await navigator.share({title:"LuminaShutter Computational Long Exposure",text:`Shot with LuminaShutter (${this.currentResult.mode.replace("_"," ")} • ${this.currentResult.durationSeconds}s • Zero Subscription)`,files:[o]})}catch{}else{navigator.clipboard?.writeText(window.location.href);const r=n.querySelector("span");if(r){const o=r.innerText;r.innerText="Link Copied!",setTimeout(()=>{r.innerText=o},2e3)}}})}}class q{container;constructor(){this.container=document.createElement("div"),this.container.className="modal-backdrop",this.render()}getElement(){return this.container}open(){this.container.classList.add("open")}close(){this.container.classList.remove("open")}render(){this.container.innerHTML=`
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <span style="color: var(--leica-amber);">${h.info}</span>
            <span>Why LuminaShutter?</span>
          </div>
          <button class="modal-close-btn" id="btnClosePricing">
            ${h.close}
          </button>
        </div>

        <div class="modal-body">
          <div style="background: rgba(255, 159, 10, 0.08); border: 1px solid rgba(255, 159, 10, 0.25); border-radius: 12px; padding: 14px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--leica-amber); margin-bottom: 4px;">
              Zero Subscriptions. Own Forever for $2.49.
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.5;">
              Spectre Camera won Apple App of the Year at $4.99. Slow Shutter Cam charges $4.99. Other pro camera apps demand $29.99/year. LuminaShutter brings cutting-edge WebGL GPU computational long-exposure to everyone for half the price of legacy rivals, with zero recurring subscriptions.
            </div>
          </div>

          <!-- Feature & Price Comparison Table -->
          <table class="comp-table">
            <thead>
              <tr>
                <th>App</th>
                <th>Price</th>
                <th>Light Trails</th>
                <th>Crowd Eraser</th>
                <th>Handheld Gyro</th>
              </tr>
            </thead>
            <tbody>
              <tr class="highlight-row">
                <td>
                  <span style="color: #fff; font-weight: 700;">LuminaShutter</span>
                </td>
                <td class="highlight-price">$2.49 once</td>
                <td>✓ (32-bit)</td>
                <td>✓ (Median AI)</td>
                <td>✓ (Auto)</td>
              </tr>
              <tr>
                <td style="color: var(--text-secondary);">Spectre Camera</td>
                <td>$4.99</td>
                <td>✓</td>
                <td>✓</td>
                <td>✓</td>
              </tr>
              <tr>
                <td style="color: var(--text-secondary);">Slow Shutter Cam</td>
                <td>$4.99</td>
                <td>✓</td>
                <td>✗</td>
                <td>Limited</td>
              </tr>
              <tr>
                <td style="color: var(--text-muted);">Pro Camera Apps</td>
                <td>$29.99/yr</td>
                <td>Optional add-on</td>
                <td>✗</td>
                <td>Varies</td>
              </tr>
            </tbody>
          </table>

          <div style="font-size: 11px; color: var(--text-muted); line-height: 1.6; background: var(--bg-panel); padding: 12px; border-radius: 10px; border: 1px solid var(--border-subtle);">
            <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Engineered for Precision:</div>
            • <strong>32-Bit Float Framebuffers:</strong> Zero banding in silky water & light trails.<br/>
            • <strong>Adaptive Temporal Median:</strong> Real-time pedestrian rejection.<br/>
            • <strong>Leica & Hasselblad Color Profiles:</strong> Natural highlight roll-off.<br/>
            • <strong>100% On-Device:</strong> No cloud upload, maximum privacy & instant processing.
          </div>

          <button class="btn-primary-action" id="btnConfirmPricing" style="margin-top: 4px;">
            <span>Unlock LuminaShutter — $2.49</span>
          </button>
        </div>
      </div>
    `;const e=this.container.querySelector("#btnClosePricing"),i=this.container.querySelector("#btnConfirmPricing");e?.addEventListener("click",()=>this.close()),i?.addEventListener("click",()=>{const t=i.querySelector("span");t&&(t.innerText="Unlocked Full Lifetime Access!",setTimeout(()=>{this.close(),t.innerText="Unlock LuminaShutter — $2.49"},1200))})}}class H{appRoot;engine;headerBar;viewfinder;modeDial;shutterArea;beforeAfterModal;pricingModal;latestResult=null;constructor(){const e=document.getElementById("app");if(!e)throw new Error("#app root element not found");this.appRoot=e,this.init()}init(){this.beforeAfterModal=new N,this.pricingModal=new q,this.viewfinder=new U;const e=this.viewfinder.getCanvas();this.engine=new B(e),this.viewfinder.bindEngine(this.engine),this.headerBar=new O(this.engine,()=>{this.pricingModal.open()}),this.modeDial=new k(this.engine),this.shutterArea=new G(this.engine,()=>{this.latestResult&&this.beforeAfterModal.open(this.latestResult)}),this.appRoot.innerHTML="",this.appRoot.appendChild(this.headerBar.getElement()),this.appRoot.appendChild(this.viewfinder.getElement()),this.appRoot.appendChild(this.modeDial.getElement()),this.appRoot.appendChild(this.shutterArea.getElement()),this.appRoot.appendChild(this.beforeAfterModal.getElement()),this.appRoot.appendChild(this.pricingModal.getElement()),this.initEventWiring()}initEventWiring(){this.engine.subscribeResult(e=>{this.latestResult=e,this.shutterArea.setLastResult(e),this.beforeAfterModal.open(e)}),window.addEventListener("keydown",e=>{e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||(e.code==="Space"?(e.preventDefault(),this.engine.getState()==="EXPOSING"?this.engine.stopExposure():this.engine.startExposure()):e.key==="1"?(this.engine.setMode("LIGHT_TRAILS"),this.syncModeUI("LIGHT_TRAILS")):e.key==="2"?(this.engine.setMode("SILKY_WATER"),this.syncModeUI("SILKY_WATER")):e.key==="3"&&(this.engine.setMode("CROWD_ERASER"),this.syncModeUI("CROWD_ERASER")))})}syncModeUI(e){document.querySelectorAll(".mode-tab").forEach(t=>t.classList.toggle("active",t.dataset.mode===e))}}window.addEventListener("DOMContentLoaded",()=>{new H});
//# sourceMappingURL=index-B76-5cLn.js.map
