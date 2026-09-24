import { safeNext } from "@/lib/safe-redirect";
import { AuthForm } from "../auth-form";

export default async function Page(props: PageProps<"/signup">) {
  const { next } = await props.searchParams;
  const target = safeNext(next);
  return <AuthForm variant="signup" next={target} />;
}
