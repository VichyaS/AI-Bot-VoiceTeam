/**
 * CLI tool to generate a bcrypt password hash.
 *
 * Usage:
 *   npx tsx src/scripts/hash-password.ts
 *   npx tsx src/scripts/hash-password.ts "my-secret-password"
 *
 * If no argument is provided, you will be prompted to enter a password.
 * The script outputs the resulting hash to stdout so it can be copied
 * into your .env file as ADMIN_PASSWORD_HASH.
 */

import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

async function main() {
  let password: string;

  if (process.argv[2]) {
    password = process.argv[2];
  } else {
    console.log('Enter password to hash:');

    password = await new Promise<string>((resolve) => {
      const stdin = process.stdin;
      stdin.resume();
      stdin.once('data', (data: Buffer) => {
        stdin.pause();
        resolve(data.toString('utf-8').trimEnd());
      });
    });
  }

  if (!password) {
    console.error('Error: Password cannot be empty.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Print only the hash so it can be piped or copied easily
  console.log(hash);
}

main().catch((err) => {
  console.error('Error generating hash:', err);
  process.exit(1);
});