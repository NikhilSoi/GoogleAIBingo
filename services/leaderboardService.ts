import type { PlayerScore } from '../types';

const LEADERBOARD_KEY = 'biasBingoLeaderboardCloud';

// --- Stubs for Cloud Backend Integration ---
// In a real application, these functions would interact with a backend like Firebase Firestore.

/**
 * Fetches the leaderboard from the data source.
 * TODO: Replace localStorage with a fetch call to your backend (e.g., Firestore).
 * @returns {Promise<PlayerScore[]>} A promise that resolves to the list of scores.
 */
export async function getLeaderboard(): Promise<PlayerScore[]> {
  try {
    const savedScores = localStorage.getItem(LEADERBOARD_KEY);
    return savedScores ? JSON.parse(savedScores) : [];
  } catch (error) {
    console.error("Failed to get leaderboard:", error);
    return [];
  }
}

/**
 * Updates a player's score on the leaderboard.
 * TODO: Replace localStorage with a POST/PUT request to your backend.
 * This should handle creating a new player or updating an existing one.
 * @param {PlayerScore} playerScore The player's score to save.
 * @returns {Promise<void>}
 */
export async function updatePlayerScore(playerScore: PlayerScore): Promise<void> {
  try {
    const scores = await getLeaderboard();
    const playerIndex = scores.findIndex(p => p.name === playerScore.name && p.startup === playerScore.startup);

    if (playerIndex > -1) {
      // Update existing player only if their new score is better.
       if(playerScore.score > scores[playerIndex].score || (playerScore.score === scores[playerIndex].score && playerScore.time < scores[playerIndex].time)) {
         scores[playerIndex] = playerScore;
       }
    } else {
      scores.push(playerScore);
    }

    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(scores));
  } catch (error) {
    console.error("Failed to update player score:", error);
  }
}

/**
 * Subscribes to real-time updates from the leaderboard.
 * TODO: Replace polling with a real-time listener from your backend (e.g., Firebase's onSnapshot).
 * @param {(scores: PlayerScore[]) => void} callback The function to call with new data.
 * @returns {() => void} A function to unsubscribe from updates.
 */
export function subscribeToLeaderboardUpdates(callback: (scores: PlayerScore[]) => void): () => void {
  // Simulate real-time updates by polling localStorage.
  // In a real app, this would be a WebSocket or a Firestore listener for true real-time functionality.
  const intervalId = setInterval(async () => {
    const scores = await getLeaderboard();
    callback(scores);
  }, 2000); // Poll every 2 seconds for updates

  // Initial fetch
  getLeaderboard().then(callback);

  // Return an unsubscribe function
  return () => clearInterval(intervalId);
}
