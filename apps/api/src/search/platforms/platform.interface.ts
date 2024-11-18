import { SearchProps } from "./types";

export interface PlatformServiceInterface {
  search(sessionId: string, data: SearchProps): Promise<void>;
}
