// public/client.js

// Initialize Socket.IO connection to the signaling server
const socket = io();

// Get references to HTML elements
const preCallDiv = document.getElementById('pre-call');
const inCallDiv = document.getElementById('in-call');
const roomIdInput = document.getElementById('room-id-input');
const userIdInput = document.getElementById('user-id-input');
const joinCallBtn = document.getElementById('join-call-btn');
const currentRoomIdSpan = document.getElementById('current-room-id');
const localUserNameSpan = document.getElementById('local-user-name');
const localAudio = document.getElementById('local-audio');
const remoteAudiosDiv = document.getElementById('remote-audios');
const leaveCallBtn = document.getElementById('leave-call-btn');
const roomLinkContainer = document.getElementById('room-link-container');
const roomLinkSpan = document.getElementById('room-link');
const statusMessage = document.getElementById('status-message');
const muteUnmuteBtn = document.getElementById('mute-unmute-btn'); // New: Reference to the mute/unmute button

// Global variables for local media stream and peer connections
let localStream;
// peerConnections stores RTCPeerConnection objects, keyed by the remote peer's socket.id
const peerConnections = {}; 
// usersInRoom stores the user's chosen name (userId) for each peer, keyed by their socket.id
const usersInRoom = {}; 

// New: Variable to track mic mute state
let isMicMuted = false;

// Configuration for ICE (Interactive Connectivity Establishment) servers.
const ICE_SERVERS = [{
    urls: 'stun:stun.l.google.com:19302' // Google's public STUN server
}];

// Function to generate a simple random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 9); // Generates a 7-character alphanumeric string
}

// Check for a room ID in the URL on page load
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (roomIdFromUrl) {
        roomIdInput.value = roomIdFromUrl;
        statusMessage.textContent = `Joining room: ${roomIdFromUrl}. Please enter your name to proceed.`;
    }
});

// Event listener for the "Join Call" button
joinCallBtn.addEventListener('click', async () => {
    const roomId = roomIdInput.value.trim();
    const userId = userIdInput.value.trim();

    // Validate inputs
    if (!roomId) {
        roomIdInput.value = generateRoomId(); // Suggest a new ID if the field is empty
        statusMessage.textContent = 'A unique room ID is generated. Please enter your name and click Join Call again.';
        return;
    }
    if (!userId) {
        statusMessage.textContent = 'Please enter your name to join the call.';
        return;
    }

    try {
        // Request access to the user's microphone (audio only for this app)
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localAudio.srcObject = localStream; // Attach local stream to a hidden audio element (muted)

        // Update UI to show in-call view
        preCallDiv.style.display = 'none';
        inCallDiv.style.display = 'block';
        currentRoomIdSpan.textContent = roomId;
        localUserNameSpan.textContent = `You are: ${userId}`;
        
        // Update the browser's URL to include the room ID.
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('room', roomId);
        window.history.pushState({ path: newUrl.href }, '', newUrl.href);

        // Display the shareable room link
        roomLinkSpan.textContent = newUrl.href;
        roomLinkContainer.style.display = 'flex'; // Use flex for better layout of link and copy button

        // Store the local user's name (userId) indexed by their socket.id
        usersInRoom[socket.id] = userId; 

        // Emit 'join-room' event to the signaling server
        socket.emit('join-room', roomId, userId);

        // New: Initialize mute button state
        isMicMuted = false; // Assume mic is active initially
        muteUnmuteBtn.textContent = 'Mute Mic';
        muteUnmuteBtn.classList.remove('mute-btn-muted');
        muteUnmuteBtn.classList.add('mute-btn-active');

    } catch (err) {
        console.error('Error accessing media devices:', err);
        statusMessage.textContent = `Error accessing microphone: ${err.message}. Please allow microphone access and try again.`;
    }
});

// Event listener for the "Leave Call" button
leaveCallBtn.addEventListener('click', () => {
    // Iterate through all active peer connections and close them gracefully
    for (const peerId in peerConnections) {
        if (peerConnections[peerId]) {
            peerConnections[peerId].close();
            delete peerConnections[peerId];
            removeRemoteAudio(peerId); // Remove associated audio element from UI
        }
    }

    // Stop all tracks in the local media stream (releases microphone)
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    // Disconnect from the Socket.IO signaling server
    socket.disconnect();

    // Reset UI to pre-call state
    inCallDiv.style.display = 'none';
    preCallDiv.style.display = 'block';
    roomIdInput.value = '';
    userIdInput.value = '';
    statusMessage.textContent = 'You have left the call.';
    roomLinkContainer.style.display = 'none';

    // Reload the page to clear all WebRTC and Socket.IO state, ensuring a clean slate.
    window.location.reload();
});

// New: Event listener for the "Mute/Unmute Mic" button
muteUnmuteBtn.addEventListener('click', () => {
    if (localStream) {
        // Get all audio tracks from the local stream (usually there's only one)
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled; // Toggle the 'enabled' state of the track
            isMicMuted = !track.enabled; // Update our internal state
        });

        // Update button text and styling based on the new mute state
        if (isMicMuted) {
            muteUnmuteBtn.textContent = 'Unmute Mic';
            muteUnmuteBtn.classList.remove('mute-btn-active');
            muteUnmuteBtn.classList.add('mute-btn-muted');
            console.log('Microphone muted.');
        } else {
            muteUnmuteBtn.textContent = 'Mute Mic';
            muteUnmuteBtn.classList.remove('mute-btn-muted');
            muteUnmuteBtn.classList.add('mute-btn-active');
            console.log('Microphone unmuted.');
        }
    } else {
        console.warn('Cannot toggle mic mute: local stream not available.');
        statusMessage.textContent = 'Please join a call first to use the mic mute feature.';
        statusMessage.style.color = '#dc3545';
        setTimeout(() => statusMessage.textContent = '', 3000);
    }
});


// --- Socket.IO Event Listeners ---

// Fired when the client successfully connects to the signaling server
socket.on('connect', () => {
    console.log('Connected to signaling server with ID:', socket.id);
});

// Fired when a new user joins the same room
socket.on('user-joined', async (peerId, remoteUserId, existingPeerIds) => {
    console.log(`User ${remoteUserId} (${peerId}) joined. Existing peers for this new user: ${existingPeerIds}`);
    // Store the new user's name
    usersInRoom[peerId] = remoteUserId; 

    // If a peer connection to this new user doesn't already exist, create one.
    if (!peerConnections[peerId]) {
        await createPeerConnection(peerId, true); // 'true' indicates this side is the initiator
    } else {
        console.log(`Peer connection to ${peerId} already exists. Skipping creation.`);
    }
});

// Fired when the joining client receives a list of users already in the room
socket.on('existing-users', async (existingPeerIds) => {
    console.log(`Existing users in room (received by me): ${existingPeerIds}`);
    // For each existing user, create a new peer connection.
    for (const peerId of existingPeerIds) {
        if (!peerConnections[peerId]) {
            await createPeerConnection(peerId, true); // 'true' indicates this side is the initiator
        }
    }
});

// Fired when a signaling message (offer, answer, ICE candidate) is received from another peer via the server
socket.on('signal', async ({ from, data }) => {
    console.log(`Received signal from ${from}:`, data);
    // If a peer connection to the sender already exists, pass the signal to it.
    if (peerConnections[from]) {
        try {
            await peerConnections[from].signal(data);
        } catch (e) {
            console.error(`Error signaling peer ${from}:`, e);
        }
    } else {
        // This case can happen if an offer arrives before createPeerConnection is called on this side.
        // Create a new peer connection for the sender and then process the signal.
        console.log(`Creating new peer connection for ${from} due to incoming signal.`);
        await createPeerConnection(from, false); // 'false' indicates this side is NOT the initiator
        try {
            await peerConnections[from].signal(data);
        } catch (e) {
            console.error(`Error signaling peer ${from} after creation:`, e);
        }
    }
});

// Fired when a user leaves the room
socket.on('user-left', (peerId) => {
    console.log(`User ${peerId} left the room`);
    // Close the peer connection to the departed user
    if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId]; // Remove from our map
        delete usersInRoom[peerId]; // Remove user's name
        removeRemoteAudio(peerId); // Remove their audio element from the UI
    }
});

// --- WebRTC Core Functions ---

/**
 * Creates and configures a new RTCPeerConnection for a specific remote peer.
 * @param {string} peerId - The socket.id of the remote peer.
 * @param {boolean} isInitiator - True if this peer is initiating the connection (sending the offer).
 */
async function createPeerConnection(peerId, isInitiator) {
    // Create a new RTCPeerConnection instance
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[peerId] = pc; // Store it for future reference

    // Add the local audio track to the peer connection.
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Event listener for ICE candidates generated by the local peer.
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // Send the ICE candidate to the remote peer via the signaling server.
            socket.emit('signal', { to: peerId, from: socket.id, data: event.candidate });
        }
    };

    // Event listener for when remote tracks (audio/video) are received from the peer.
    pc.ontrack = (event) => {
        // The event.streams[0] contains the MediaStream from the remote peer.
        console.log(`Remote stream received from ${usersInRoom[peerId] || peerId}`);
        addRemoteAudio(peerId, event.streams[0]); // Add this stream to a new audio element in the UI
    };

    // Event listener for negotiationneeded. This fires when the RTCPeerConnection needs to exchange
    // SDP (Session Description Protocol) offers/answers.
    pc.onnegotiationneeded = async () => {
        // Only the initiator (the one who creates the offer) performs this step initially.
        if (isInitiator) {
            try {
                // Create an SDP offer
                const offer = await pc.createOffer();
                // Set the local description (our offer)
                await pc.setLocalDescription(offer);
                // Send the offer to the remote peer via the signaling server
                socket.emit('signal', { to: peerId, from: socket.id, data: pc.localDescription });
            } catch (e) {
                console.error(`Error creating offer for ${peerId}:`, e);
            }
        }
    };

    // Event listener for changes in the ICE connection state.
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${usersInRoom[peerId] || peerId}:`, pc.iceConnectionState);
    };

    // Custom method to handle incoming signaling data (offer, answer, candidate)
    pc.signal = async (data) => {
        if (data.type === 'offer') {
            if (!pc.remoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(data)); 
                const answer = await pc.createAnswer(); 
                await pc.setLocalDescription(answer); 
                socket.emit('signal', { to: peerId, from: socket.id, data: pc.localDescription });
            } else {
                console.warn(`Skipping redundant offer from ${peerId}`);
            }
        } else if (data.type === 'answer') {
            if (!pc.remoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
            } else {
                console.warn(`Skipping redundant answer from ${peerId}`);
            }
        } else if (data.candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data));
            } catch (e) {
                console.error(`Error adding ICE candidate from ${peerId}:`, e);
            }
        }
    };
}

/**
 * Dynamically creates and adds an <audio> element for a remote participant's stream.
 * @param {string} peerId - The socket.id of the remote peer.
 * @param {MediaStream} stream - The remote peer's audio MediaStream.
 */
function addRemoteAudio(peerId, stream) {
    let audioContainer = document.getElementById(`audio-container-${peerId}`);
    if (!audioContainer) {
        audioContainer = document.createElement('div');
        audioContainer.id = `audio-container-${peerId}`;
        audioContainer.className = 'peer-audio-container p-3 bg-gray-100 rounded-md shadow-sm flex flex-col items-center';

        const audio = document.createElement('audio');
        audio.autoplay = true; 
        audio.controls = false; 
        audio.srcObject = stream;
        audio.id = `remote-audio-${peerId}`;

        const userNameP = document.createElement('p');
        userNameP.textContent = usersInRoom[peerId] || `User ${peerId.substring(0, 5)}`;
        userNameP.className = 'mt-2 text-sm font-medium text-gray-700';

        audioContainer.appendChild(audio);
        audioContainer.appendChild(userNameP);
        remoteAudiosDiv.appendChild(audioContainer); 
    } else {
        const audio = document.getElementById(`remote-audio-${peerId}`);
        audio.srcObject = stream;
        const userNameP = audioContainer.querySelector('p');
        userNameP.textContent = usersInRoom[peerId] || `User ${peerId.substring(0, 5)}`;
    }
}

/**
 * Removes a remote participant's audio element from the UI.
 * @param {string} peerId - The socket.id of the remote peer.
 */
function removeRemoteAudio(peerId) {
    const audioContainer = document.getElementById(`audio-container-${peerId}`);
    if (audioContainer) {
        audioContainer.remove();
    }
}

/**
 * Copies the current room link to the clipboard.
 */
function copyRoomLink() {
    const link = roomLinkSpan.textContent;
    navigator.clipboard.writeText(link).then(() => {
        statusMessage.textContent = 'Room link copied to clipboard!';
        statusMessage.style.color = '#28a745'; 
        setTimeout(() => statusMessage.textContent = '', 3000); 
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = link;
        tempInput.select();
        try {
            document.execCommand('copy');
            statusMessage.textContent = 'Room link copied to clipboard (fallback)!';
            statusMessage.style.color = '#28a745';
            setTimeout(() => statusMessage.textContent = '', 3000);
        } catch (e) {
            statusMessage.textContent = 'Failed to copy link. Please copy manually.';
            statusMessage.style.color = '#dc3545'; 
        } finally {
            document.body.removeChild(tempInput);
        }
    });
}
