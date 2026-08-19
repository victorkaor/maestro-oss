self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "maestro-oss", {
      body: payload.body ?? "",
    }),
  );
});
