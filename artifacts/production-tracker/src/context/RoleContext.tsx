import { createContext, useContext } from "react";
import type { UserRole } from "@/hooks/useAdminAuth";

export const RoleContext = createContext<UserRole>(null);

export function useRole(): UserRole {
  return useContext(RoleContext);
}
