import { POST as teamLogin } from "@/app/api/auth/team/login/route";
import { POST as adminLogin } from "@/app/api/auth/admin/login/route";
import { ADMIN_PASSWORD, call, cookieFrom } from "./setup";

export async function loginTeam(n: number, password = `Team${n}`): Promise<string> {
  const r = await call(teamLogin, { body: { username: `Team${n}`, password } });
  if (r.status !== 200) throw new Error(`Team${n} login failed: ${r.raw}`);
  return cookieFrom(r.res);
}

export async function loginAdmin(): Promise<string> {
  const r = await call(adminLogin, { body: { username: "Tanmay", password: ADMIN_PASSWORD } });
  if (r.status !== 200) throw new Error(`admin login failed: ${r.raw}`);
  return cookieFrom(r.res);
}
