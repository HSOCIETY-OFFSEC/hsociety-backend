export const registerNotificationsSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.data?.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });
};

export default registerNotificationsSocket;
