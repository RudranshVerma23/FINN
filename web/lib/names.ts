// Display helpers safe for both server and client components.

/** "Tata Power Company Limited" -> "Tata Power Company"; "Dixon Technologies (India) Ltd" -> "Dixon Technologies". */
export function shortName(name: string): string {
  return name
    .replace(/\s+(Limited|Ltd\.?)$/i, "")
    .replace(/\s*\(India\)/i, "")
    .replace(/Corporation of India/i, "Corp")
    .replace(/Enterprise$/i, "")
    .trim();
}
