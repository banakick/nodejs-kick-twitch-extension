import { WebSocketServer, WebSocket } from "ws"
import { existsSync, writeFile, readFileSync } from "fs";
import * as localtunnel from "localtunnel"

// List of admin usernames, must match the capitalization of the usernames in the chat
let admins = ["Bananirou", "wallsandbridges", "LindYellow"];
let ADD_POINTS_EVERY_SECONDS = 10;
let ADD_POINTS_AMOUNT = 10;
let SAVE_USER_POINTS_EVERY_SECONDS = 60;

let DEFAULT_PORT = "3000";

class ClientError extends Error {
  constructor(message?: string) {
    super(message); // Pass the message to the Error constructor
    this.name = 'ClientError'; // Set the name of the error

    // This line is needed to restore the correct prototype chain. 
    // (see note below)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const wss = new WebSocketServer({ port: parseInt(process.env.PORT || DEFAULT_PORT) });

interface Prediction {
  title: string;
  options: string[];
  status: "ONGOING" | "FINISHED" | "NONE";
  start_time: number;
  points: Map<string, number>[];
  winner_index?: number;
}

interface ChallengeValue {
  username: string | undefined;
  client: WebSocket;
}

let prediction: Prediction = {
  title: "",
  options: [],
  status: "NONE",
  start_time: 0,
  points: [],
}

// Load user points from "user_points.json" if it exists, otherwise initialize an empty map
let user_points = new Map<string, number>();
if (existsSync("user_points.json")) {
  const data = readFileSync("user_points.json", "utf-8");
  user_points = new Map(JSON.parse(data));
  saveUserPoints();
}
function saveUserPoints() {
  const data = JSON.stringify(Array.from(user_points));
  writeFile("./user_points.json", data, (err) => {
    if (err) {
      console.error("Failed to save user points:", err);
    }
  });
}

setInterval(saveUserPoints, SAVE_USER_POINTS_EVERY_SECONDS * 1000);

let challenges = new Map<string, ChallengeValue>();

// Connect to WebSocket server
const auth_conn = new WebSocket("wss://ws-us2.pusher.com/app/eb1d5f283081a78b932c?protocol=7&client=js&version=7.6.0&flash=false", {
  headers: {
    "origin": "https://www.kick.com",
  }
});

auth_conn.on("open", () => {
  auth_conn.send('{"event":"pusher:subscribe","data":{"auth":"","channel":"chatrooms.3623927.v2"}}');
});

auth_conn.on("message", (messageBuffer) => {
  let message = JSON.parse(messageBuffer.toString()) as { event: string, data: any };

  switch (message.event) {
    case "pusher:error":
      console.error("Auth chat error:", message.data);
      console.log("TODO RECONNECT");
      break;
    case "App\\Events\\ChatMessageEvent":
      let { content, sender: { username } } = JSON.parse(message.data);

      if (challenges.has(content) && challenges.get(content).username === undefined) {
        let { client } = challenges.get(content)
        challenges.set(content, { username, client });

        let points = user_points.get(username) || 0;
        user_points.set(username, points);

        client.send(JSON.stringify({ type: 'logged_in', username, points: user_points.get(username) || 0 }));
        console.log("Client logged_in:", username);
      }

      break;
    default:
      console.log("Unknown event:", message.event, message.data);
  }
});

function ensureAuthenticated(challengeId: string) {
  if (!challenges.has(challengeId) || challenges.get(challengeId).username === undefined) {
    throw new ClientError("User not authenticated");
  }
}

function ensureAdmin(challengeId: string) {
  if (!challenges.has(challengeId) || admins.includes(challenges.get(challengeId).username) === false) {
    throw new ClientError("User not admin");
  }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  sendPredictionUpdate(prediction, ws);

  // Create a new challenge with a random id
  const challengeId = Math.random().toString(36).substring(7);
  challenges.set(challengeId, { username: undefined, client: ws });

  // Send challenge message with the id
  const challengeMessage = {
    type: 'challenge',
    id: challengeId,
  };
  ws.send(JSON.stringify(challengeMessage));
  console.log('New client connected with challenge id:', challengeId);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      switch (data.type) {
        case 'predict_new':
          ensureAdmin(challengeId);
          if (typeof data.title !== "string"
            || !Array.isArray(data.options)
            || data.options.length < 2
            || data.options.some(option => typeof option !== "string")
          ) {
            throw new ClientError("Invalid predict_new message");
          }
          let seconds = data.seconds || 120;

          prediction = {
            start_time: Date.now() + seconds * 1000,
            title: data.title,
            options: data.options,
            status: "ONGOING",
            points: Array(data.options.length).fill(() => new Map<string, number>()).map(f => f()),
          };

          broadcastPredictionUpdate(prediction);
          break;

        case 'predict_delete':
          ensureAdmin(challengeId);
          prediction.status = "NONE";
          broadcastPredictionUpdate(prediction);
          break;

        case 'predict_vote':
          ensureAuthenticated(challengeId);
          if (prediction.status !== "ONGOING") {
            throw new ClientError("Invalid predict_points state");
          }
          if (Date.now() >= prediction.start_time) {
            throw new ClientError("Prediction has already started");
          }

          let points = data.points;
          let { username } = challenges.get(challengeId)!;
          let current_points = user_points.get(username);

          if (typeof points !== "number" || points < 0 || points > current_points) {
            throw new ClientError("Invalid points value");
          }

          let index = data.index;
          if (typeof index !== "number" || index < 0 || index >= prediction.options.length) {
            throw new ClientError("Invalid index value");
          }

          if (prediction.points.filter((_, i) => i !== index).some(map => map.has(username))) {
            throw new ClientError("User has already predicted for another option");
          }

          let already_predicted_points = prediction.points[index].get(username) || 0;
          prediction.points[index].set(username, already_predicted_points + points);

          user_points.set(username, current_points - points);

          sendPredictionUpdate(prediction, ws);
          sendUserPointsUpdate(username);

          break;

        case 'predict_winner':
          ensureAdmin(challengeId);
          if (prediction.status !== "ONGOING") {
            throw new ClientError("Invalid predict_winner state");
          }
          if (Date.now() < prediction.start_time) {
            throw new ClientError("Prediction has not started yet");
          }
          if (data.winner_index < 0 || data.winner_index >= prediction.options.length) {
            throw new ClientError("Invalid winner index");
          }
          prediction.status = "FINISHED";

          let sum_points = (map: Map<string, number>) => Array.from(map.values()).reduce((a, b) => a + b, 0);

          let winners_total_points = sum_points(prediction.points[data.winner_index]) || 1; // Avoid division by zero
          let total_points = prediction.points.map(sum_points).reduce((a, b) => a + b, 0);
          let ratio = total_points / winners_total_points;

          prediction[data.winner_index].forEach((points, username) => {
            user_points.set(username, user_points.get(username) + Math.ceil(points * ratio));
            sendUserPointsUpdate(username);
          });

          broadcastPredictionUpdate(prediction);
          break;
        default:
          throw new ClientError("Unknown message type");
      }
    } catch (error) {
      if (error instanceof ClientError) {
        ws.send(JSON.stringify({ type: 'error', message: error.message }));
      } else {
        console.error("Error processing message:", error);
      }
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${challengeId}`);
    challenges.delete(challengeId);
  });
});

process.on('exit', () => {
  wss.close();
});

function predictionUpdateJson(prediction: Prediction) {
  let new_prediction = { ...prediction } as any;
  new_prediction.points = prediction.points.map((map) => Object.fromEntries(map));
  return JSON.stringify({ type: 'prediction_update', prediction: new_prediction })
}

// Broadcast prediction update to all clients
function broadcastPredictionUpdate(prediction: Prediction) {
  const prediction_data = predictionUpdateJson(prediction);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(prediction_data);
    }
  });
}

function sendPredictionUpdate(prediction: Prediction, client: WebSocket) {
  const prediction_data = predictionUpdateJson(prediction);
  client.send(prediction_data);
}

function clientsForUsername(username: string) {
  return Array.from(challenges.values())
    .filter(({ username: challenge_username }) => username === challenge_username)
    .map(({ client }) => client);
}

function sendUserPointsUpdate(username: string) {
  clientsForUsername(username).forEach((client) => {
    client.send(JSON.stringify({ type: 'points_update', points: user_points.get(username) || 0 }));
  })
}

function addPointsToEveryoneOnline(points: number) {
  Array.from(challenges.values())
    .filter(({ username }) => username !== undefined)
    .reduce((acc, { username }) => acc.add(username), new Set<string>())
    .forEach((username) => {
      let current_points = user_points.get(username) || 0;
      user_points.set(username, current_points + points);
      sendUserPointsUpdate(username);
    });
}

setInterval(() => {
  addPointsToEveryoneOnline(ADD_POINTS_AMOUNT);
}, ADD_POINTS_EVERY_SECONDS * 1000);

(async () => {
  const tunnel = await localtunnel({
    port: parseInt(process.env.PORT || DEFAULT_PORT),
    subdomain: "bananirou-points",
  });
  console.log(tunnel.url);

  tunnel.on('close', () => {
    // tunnels are closed
  });
})();