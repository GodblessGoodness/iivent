/*
 import { randomUUID, randomBytes } from 'node:crypto';

 import { ref } from 'node:process';

  // 32-character alphabet omitting easily confused characters (like 0/O and 1/I)
 const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

 //Generates a standard machine-readable UUID for internal records
 
 export function newId() {
   return randomUUID();
 }

 /**
 Generates an 8-character human-friendly booking reference code
*/

/* export function newReference() {
   const bytes = randomBytes(8);
   let ref = '';
   for (let i = 0; i < 8; i++) {
    // Pick a character using the random byte
    ref += ALPHABET[bytes[i] % ALPHABET.length];
   }
  return ref;
 }
*/

import { randomBytes, randomUUID } from "node:crypto";

// No 0/O or 1/I, so a code read out loud at the door is hard to get wrong.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 characters

export function newId() {
  return randomUUID();
}

// 32 characters divides 256 evenly, so `byte % 32` has no bias.
// Math.random() would work too, but it is not meant for codes people rely on.
export function referenceCode(length = 8) {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}
