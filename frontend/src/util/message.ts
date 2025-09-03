export function openReplyToMessageWindow(message, options: any) {
  options.message = message;
  console.log("MESSAGE", message);
  // post("/create-send", options).then((data) =>
  //   openWindow(data.endpoint, {
  //     title: `Kanmail: reply to ${message.subject}`,
  //   })
  // );
}
