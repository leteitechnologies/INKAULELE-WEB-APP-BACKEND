declare module 'streamifier' {
  interface Streamifier {
    createReadStream(buffer: Buffer): NodeJS.ReadableStream;
  }

  const streamifier: Streamifier;
  export default streamifier;
}
