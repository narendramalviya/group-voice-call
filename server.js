// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Define the port the server will listen on
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
// This means index.html, client.js, and any CSS files will be accessible
app.use(express.static(path.join(__dirname, 'public')));

// Object to store active rooms and their participants (socket.id)
// Structure: { 'roomId': ['socketId1', 'socketId2', ...] }
const rooms = {};

// Handle new WebSocket connections from clients
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Event listener for when a user wants to join a room
    // 'roomId' is the unique identifier for the call group
    // 'userId' is the user's chosen display name
    socket.on('join-room', (roomId, userId) => {
        // Make the Socket.IO socket join a specific room
        socket.join(roomId);
        console.log(`User ${userId} (${socket.id}) joined room: ${roomId}`);

        // Initialize the room array if it doesn't exist yet
        if (!rooms[roomId]) {
            rooms[roomId] = [];
        }

        // Add the user's socket ID to the room's participant list if not already present
        if (!rooms[roomId].includes(socket.id)) {
            rooms[roomId].push(socket.id);
        }

        // Notify all other users in the room (excluding the sender) that a new user has joined.
        // Also send them the new user's socket.id and their userId (name), and the list of existing peers.
        socket.to(roomId).emit('user-joined', socket.id, userId, rooms[roomId].filter(id => id !== socket.id));
        
        // Send the list of existing users in the room to the newly joined user.
        // This is crucial for the new user to initiate WebRTC connections with everyone already present.
        socket.emit('existing-users', rooms[roomId].filter(id => id !== socket.id));
    });

    // Event listener for WebRTC signaling messages (offers, answers, ICE candidates)
    // These messages are relayed between specific peers to set up their connections.
    socket.on('signal', ({ to, from, data }) => {
        // Relay the signal to the target peer identified by 'to' socket.id
        // 'from' is the sender's socket.id, and 'data' is the WebRTC signaling payload.
        io.to(to).emit('signal', { from: from, data: data });
    });

    // Event listener for when a user disconnects (e.g., closes browser tab, leaves call)
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Iterate through all rooms to find and remove the disconnected user
        for (const roomId in rooms) {
            const index = rooms[roomId].indexOf(socket.id);
            if (index > -1) {
                // Remove the user's socket.id from the room
                rooms[roomId].splice(index, 1);
                // If the room becomes empty, delete the room from the 'rooms' object
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} is now empty and deleted.`);
                } else {
                    // If the room is not empty, notify remaining users that this user has left
                    socket.to(roomId).emit('user-left', socket.id);
                    console.log(`User ${socket.id} left room ${roomId}. Remaining users: ${rooms[roomId].length}`);
                }
                break; // A socket should typically only be in one room in this simple setup
            }
        }
    });
});

// Start the server and listen on the specified port
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
});
