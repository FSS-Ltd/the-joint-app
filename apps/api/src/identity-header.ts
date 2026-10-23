import { UnauthorizedException } from "@nestjs/common";
export function readIdentityToken(header: string | undefined): string {
  if (header?.match(/^Session [A-Za-z0-9_-]{43}$/)) return header.slice(8);
  if (
    header &&
    header.length <= 16400 &&
    /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header)
  )
    return header.slice(7);
  throw new UnauthorizedException();
}
