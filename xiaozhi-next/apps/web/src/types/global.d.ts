/* eslint-disable */

declare module 'sm-crypto' {
  const sm2: {
    doDecrypt(encryptedData: string, privateKey: string, cipherMode?: number): string;
    doEncrypt(data: string, publicKey: string, cipherMode?: number): string;
    generateKeyPairHex(): { privateKey: string; publicKey: string };
  };
  export { sm2 };
}
