// Suno requires a callBackUrl on every task. Tunesmith polls the API for
// results, so this endpoint only needs to acknowledge the notification.
export default async () =>
  new Response(JSON.stringify({ code: 200, msg: "received" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
