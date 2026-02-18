import { serve } from "inngest/vercel";
import { inngest, functions } from "../inngest/index.js";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
