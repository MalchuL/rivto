import { redirect } from "next/navigation";
import { FRONTEND_ROUTES } from "@/lib/constants/routes";

export default function HomePage() {
  redirect(FRONTEND_ROUTES.journal);
}
