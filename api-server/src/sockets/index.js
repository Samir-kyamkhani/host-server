import { Server } from "socket.io";

const io = new Server({ cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    socket.emit("message", `Joined ${channel}`);
  });
});

export function initSocketServer() {
  io.listen(9002, () => console.log("✅ Socket.IO running on :9002"));
}