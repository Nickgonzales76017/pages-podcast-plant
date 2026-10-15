/* C source: Aurekai/native/creator/mix_kernel.c.
 * Built from its pure aurekai_mix_f32 operation for this browser surface.
 * clang 17 wasm32 -O2 -fno-fast-math -ffp-contract=off, fixed two-page memory.
 * The reviewed upstream WASM artifact has a different hash; never claim bit parity
 * with that particular build. This build is validated by the runtime hash below.
 * No user media is sent over a network.
 */
export const KERNEL_SHA256="fce89c53bd930e0a8cd8ddefa75a1e3da0c47c4c73334aa97667dda24c21cacf";
const base64="AGFzbQEAAAABCAFgBH9/fX8AAwIBAAUEAQECAgYPAn8BQYCIAQt/AEGAiAELByoDBm1lbW9yeQIAD2F1cmVrYWlfbWl4X2YzMgAAC19faGVhcF9iYXNlAwEKpwEBpAEBBX8CQCADRQ0AIANBAXEhBEEAIQUCQCADQQFGDQAgA0F+cSEGQQAhBSAAIQMgASEHA0AgAyADKgIAIAcqAgAgApSSOAIAIANBBGoiCCAIKgIAIAdBBGoqAgAgApSSOAIAIANBCGohAyAHQQhqIQcgBiAFQQJqIgVHDQALCyAERQ0AIAAgBUECdCIDaiIHIAcqAgAgASADaioCACAClJI4AgALCwA/BG5hbWUAEA9uYXRpdmVfbWl4Lndhc20BEgEAD2F1cmVrYWlfbWl4X2YzMgcSAQAPX19zdGFja19wb2ludGVyAH8JcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBBWNsYW5nXzE3LjAuMCAoaHR0cHM6Ly9naXRodWIuY29tL3N3aWZ0bGFuZy9sbHZtLXByb2plY3QuZ2l0IDEwOTk5YjZkMDM0ZmUzMThmM2Q1NmM4M2JkZGI2NTcyNTkzYThiYjApAEkPdGFyZ2V0X2ZlYXR1cmVzBCsKbXVsdGl2YWx1ZSsPbXV0YWJsZS1nbG9iYWxzKw9yZWZlcmVuY2UtdHlwZXMrCHNpZ24tZXh0";
export async function createNativeMixer(){
  const binary=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",binary))]
    .map(b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==KERNEL_SHA256)throw Error("Native mixer kernel integrity mismatch.");
  const module=await WebAssembly.compile(binary);
  if(WebAssembly.Module.imports(module).length)throw Error("Mixer kernel imports are forbidden.");
  const e=(await WebAssembly.instantiate(module)).exports;
  const base=e.__heap_base?.value,capacity=1024*8;
  if(!(e.memory instanceof WebAssembly.Memory)||e.memory.buffer.byteLength!==131072||
     typeof e.aurekai_mix_f32!=="function"||!Number.isSafeInteger(base)||base<16384||
     base%4||base+capacity*8>131072)throw Error("Mixer kernel ABI mismatch.");
  const dst=new Float32Array(e.memory.buffer,base,capacity);
  const source=new Float32Array(e.memory.buffer,base+capacity*4,capacity);
  return Object.freeze({kernel:"native C f32 WASM · SHA-256 "+hash,
    mixBlock({frames,channels=2,stems}){
      if(!Number.isSafeInteger(frames)||frames<1||frames>1024||
         ![1,2,4,8].includes(channels)||!Array.isArray(stems)||stems.length>64)
         throw RangeError("Mix block exceeds the native bound.");
      const count=frames*channels;dst.fill(0,0,count);
      for(const stem of stems){
        if(!(stem.samples instanceof Float32Array)||!Number.isFinite(stem.gain)||
           stem.gain < -4||stem.gain>4||!Number.isSafeInteger(stem.at)||
           stem.at<0||stem.at>=frames||stem.samples.length>count-stem.at*channels||
           stem.samples.length%channels)throw RangeError("Invalid mixer stem.");
        source.set(stem.samples,0);
        e.aurekai_mix_f32(base+stem.at*channels*4,base+capacity*4,
          Math.fround(stem.gain),stem.samples.length);
      }
      const result=dst.slice(0,count);
      for(const v of result)if(!Number.isFinite(v))throw Error("Nonfinite mix sample.");
      return result;
    }
  });
}