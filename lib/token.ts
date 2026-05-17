export interface TokenPayload {
  name?: string;
  address?: string;
  deviceSn?: string;
  plantId?: string;
  issuedAt?: number;
}

export interface VerifyTokenResult {
  valid: boolean;
  expired?: boolean;
  payload?: TokenPayload;
}

export async function verifyToken(_token: string): Promise<VerifyTokenResult> {
  // TODO: implement HMAC SHA256 verification + 24h expiry check
  return { valid: false };
}
