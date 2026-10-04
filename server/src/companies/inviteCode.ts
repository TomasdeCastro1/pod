import { randomInt } from 'node:crypto';

export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 6;

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_LENGTH; i++) out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return out;
}
