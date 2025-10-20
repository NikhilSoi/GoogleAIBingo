import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BIASES, GAME_DURATION_SECONDS, STARTUPS } from './constants';
import { CameraIcon, ClockIcon, TrophyIcon, CloseIcon } from './components/icons';
import type { Bias, Evidence, GameState, GameStatus, PlayerScore } from './types';
import { subscribeToLeaderboardUpdates, updatePlayerScore } from './services/leaderboardService';

// --- HELPER COMPONENTS (Defined outside App to prevent re-creation on re-renders) ---

const ConfettiPiece: React.FC<{ id: number }> = ({ id }) => {
    const colors = ['bg-yellow-400', 'bg-red-500', 'bg-blue-500', 'bg-green-400', 'bg-pink-500', 'bg-purple-500'];
    const style = {
        left: `${Math.random() * 100}vw`,
        animationDuration: `${Math.random() * 3 + 2}s`,
        animationDelay: `${Math.random() * 2}s`,
        transform: `rotate(${Math.random() * 360}deg)`,
    };
    const colorClass = colors[id % colors.length];

    return <div className={`absolute top-[-10px] h-3 w-2 ${colorClass} animate-fall`} style={style}></div>;
};

const Confetti: React.FC = () => (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 overflow-hidden">
        {[...Array(100)].map((_, i) => <ConfettiPiece key={i} id={i} />)}
    </div>
);

interface TimerProps {
  startTime: number;
  duration: number;
  onTimeUp: () => void;
}
const Timer: React.FC<TimerProps> = ({ startTime, duration, onTimeUp }) => {
    const [remaining, setRemaining] = useState(duration);

    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = (Date.now() - startTime) / 1000;
            const newRemaining = Math.max(0, duration - elapsed);
            setRemaining(newRemaining);

            if (newRemaining === 0) {
                onTimeUp();
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime, duration, onTimeUp]);

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = Math.floor(remaining % 60);

    return (
        <div className="flex items-center space-x-2 bg-gray-800/50 backdrop-blur-sm px-4 py-2 rounded-full">
            <ClockIcon className="w-6 h-6 text-cyan-400" />
            <span className="text-lg font-mono tracking-wider">
                {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

export default function App() {
    const [gameState, setGameState] = useState<GameState>({
        status: 'start',
        playerName: '',
        startupName: '',
        startTime: null,
        foundEvidence: {},
    });

    const [activeModal, setActiveModal] = useState<'upload' | 'leaderboard' | 'finished' | null>(null);
    const [selectedBias, setSelectedBias] = useState<Bias | null>(null);
    const [bingo, setBingo] = useState<string | null>(null);
    const [leaderboard, setLeaderboard] = useState<PlayerScore[]>([]);

    // Load game state from localStorage on initial render
    useEffect(() => {
        try {
            const savedState = localStorage.getItem('biasBingoGameState');
            if (savedState) {
                const parsedState: GameState = JSON.parse(savedState);
                if(parsedState.status === 'playing' && parsedState.startTime){
                    const elapsed = (Date.now() - parsedState.startTime) / 1000;
                    if(elapsed >= GAME_DURATION_SECONDS){
                        parsedState.status = 'finished';
                         handleTimeUp(true); // Game already finished
                    }
                }
                setGameState(parsedState);
            }
        } catch (error) {
            console.error("Failed to load game state:", error);
        }
    }, []);

    // Save game state to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('biasBingoGameState', JSON.stringify(gameState));
        } catch (error) {
            console.error("Failed to save game state:", error);
        }
    }, [gameState]);
    
    // Subscribe to live leaderboard updates
    useEffect(() => {
        const unsubscribe = subscribeToLeaderboardUpdates((scores) => {
            setLeaderboard(scores);
        });

        return () => unsubscribe(); // Cleanup subscription on component unmount
    }, []);


    const checkBingo = useCallback((foundIds: number[]) => {
        const lines = [
            // Rows
            [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
            // Columns
            [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
            // Diagonals
            [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
        ];
        for (const line of lines) {
            if (line.every(id => foundIds.includes(id))) {
                return "BINGO!";
            }
        }
        return null;
    }, []);

    const handleStartGame = (name: string, startup: string) => {
        setGameState({
            status: 'playing',
            playerName: name,
            startupName: startup,
            startTime: Date.now(),
            foundEvidence: {},
        });
        setBingo(null);
    };

    const handleTimeUp = useCallback((isPreFinished = false) => {
       if (!isPreFinished) {
            setGameState(prev => {
                if (prev.status === 'playing' && prev.playerName && prev.startTime) {
                    const foundCount = Object.keys(prev.foundEvidence).length;
                    const playerScore: PlayerScore = {
                        name: prev.playerName,
                        startup: prev.startupName,
                        score: foundCount,
                        time: GAME_DURATION_SECONDS
                    };
                    updatePlayerScore(playerScore); // Update score on the "cloud"
                }
                return { ...prev, status: 'finished' };
            });
        }
        setActiveModal('finished');
    }, []);
    
    const handleFindBias = (bias: Bias) => {
        setSelectedBias(bias);
        setActiveModal('upload');
    };

    const handleUploadEvidence = (evidence: Evidence) => {
        if (!selectedBias) return;

        let bingoResult: string | null = null;
        
        setGameState(prev => {
            const updatedEvidence = { ...prev.foundEvidence, [selectedBias.id]: evidence };
            const newState = { ...prev, foundEvidence: updatedEvidence };

            // Update score in the cloud service
            if (newState.status === 'playing' && newState.playerName && newState.startTime) {
                const foundCount = Object.keys(updatedEvidence).length;
                const timeTaken = Math.floor((Date.now() - newState.startTime) / 1000);
                const playerScore: PlayerScore = {
                    name: newState.playerName,
                    startup: newState.startupName,
                    score: foundCount,
                    time: timeTaken
                };
                updatePlayerScore(playerScore);
            }
            
            // Check for bingo
            const foundIds = Object.keys(updatedEvidence).map(Number);
            if (!bingo) {
                bingoResult = checkBingo(foundIds);
            }

            return newState;
        });

        if (bingoResult) {
            setBingo(bingoResult);
        }

        setActiveModal(null);
        setSelectedBias(null);
    };

    const handleRestart = () => {
        localStorage.removeItem('biasBingoGameState');
        setGameState({
            status: 'start',
            playerName: '',
            startupName: '',
            startTime: null,
            foundEvidence: {},
        });
        setBingo(null);
        setActiveModal(null);
    }
    
    const leaderboardScores: PlayerScore[] = useMemo(() => {
        return [...leaderboard].sort((a, b) => b.score - a.score || a.time - b.time);
    }, [leaderboard]);


    // --- RENDER LOGIC ---

    const renderContent = () => {
        switch (gameState.status) {
            case 'start':
                return <StartScreen onStart={handleStartGame} />;
            case 'playing':
            case 'finished':
                return (
                    <GameScreen
                        gameState={gameState}
                        onFindBias={handleFindBias}
                        onTimeUp={() => handleTimeUp()}
                        onShowLeaderboard={() => setActiveModal('leaderboard')}
                        foundCount={Object.keys(gameState.foundEvidence).length}
                    />
                );
            default:
                return <StartScreen onStart={handleStartGame} />;
        }
    };

    return (
        <div className="min-h-screen p-4 sm:p-6 md:p-8">
            <div className="container mx-auto">
                {bingo && <Confetti />}
                {renderContent()}

                {activeModal === 'upload' && selectedBias && (
                    <UploadModal
                        bias={selectedBias}
                        onClose={() => setActiveModal(null)}
                        onSubmit={handleUploadEvidence}
                    />
                )}
                {activeModal === 'leaderboard' && (
                    <LeaderboardModal scores={leaderboardScores} onClose={() => setActiveModal(null)} />
                )}
                {activeModal === 'finished' && (
                    <EndGameModal 
                        onClose={() => setActiveModal(null)} 
                        onRestart={handleRestart}
                        gameState={gameState}
                        winPattern={bingo}
                    />
                )}
            </div>
        </div>
    );
}

// --- SCREEN & MODAL COMPONENTS ---

const StartScreen: React.FC<{ onStart: (name: string, startup: string) => void }> = ({ onStart }) => {
    const [name, setName] = useState('');
    const [startup, setStartup] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && startup) {
            onStart(name.trim(), startup);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
            <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400 mb-4">
                Behavioral Bias Bingo Hunt
            </h1>
            <p className="max-w-2xl text-lg text-gray-300 mb-8">
                Sharpen your marketing eye! Find real-world examples of 25 behavioral biases in 60 minutes. Complete a line to win. Ready to hunt?
            </p>
            <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter Your Name"
                    className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    required
                    aria-label="Player Name"
                />
                 <div className="relative">
                    <select
                        value={startup}
                        onChange={(e) => setStartup(e.target.value)}
                        className={`w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition appearance-none ${startup ? 'text-white' : 'text-gray-400'}`}
                        required
                        aria-label="Select your startup"
                    >
                        <option value="" disabled>Select your startup</option>
                        {STARTUPS.map(s => <option key={s} value={s} className="text-white bg-gray-900">{s}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
                <button
                    type="submit"
                    className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:opacity-90 transition-transform transform hover:scale-105"
                >
                    Start Game
                </button>
            </form>
        </div>
    );
};

interface GameScreenProps {
    gameState: GameState;
    onFindBias: (bias: Bias) => void;
    onTimeUp: () => void;
    onShowLeaderboard: () => void;
    foundCount: number;
}
const GameScreen: React.FC<GameScreenProps> = ({ gameState, onFindBias, onTimeUp, onShowLeaderboard, foundCount }) => {
    return (
        <main>
            <header className="flex flex-wrap gap-4 justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">{gameState.playerName}'s Hunt <span className="text-lg font-normal text-gray-400">@ {gameState.startupName}</span></h1>
                    <p className="text-xl text-cyan-400 font-medium">{foundCount} / 25 Found</p>
                </div>
                <div className="flex items-center gap-4">
                    {gameState.startTime && gameState.status === 'playing' && (
                        <Timer startTime={gameState.startTime} duration={GAME_DURATION_SECONDS} onTimeUp={onTimeUp} />
                    )}
                    <button onClick={onShowLeaderboard} className="p-3 bg-gray-800/50 backdrop-blur-sm rounded-full hover:bg-purple-600 transition-colors">
                        <TrophyIcon className="w-6 h-6"/>
                    </button>
                </div>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
                {BIASES.map(bias => {
                    const isFound = bias.id in gameState.foundEvidence;
                    return (
                        <BiasCard
                            key={bias.id}
                            bias={bias}
                            isFound={isFound}
                            onClick={() => !isFound && gameState.status === 'playing' && onFindBias(bias)}
                        />
                    );
                })}
            </div>
        </main>
    );
};

interface BiasCardProps {
    bias: Bias;
    isFound: boolean;
    onClick: () => void;
}
const BiasCard: React.FC<BiasCardProps> = ({ bias, isFound, onClick }) => {
    return (
        <div
            onClick={onClick}
            className={`
                aspect-square p-3 rounded-xl flex flex-col justify-center items-center text-center
                transition-all duration-300 transform
                ${isFound
                    ? 'bg-green-500/80 border-2 border-green-400 shadow-lg scale-105'
                    : 'bg-gray-800/50 border border-gray-700 backdrop-blur-sm hover:border-cyan-400 hover:scale-105 cursor-pointer'
                }
            `}
            aria-label={`Bias card for ${bias.name}. ${isFound ? 'Status: Found' : 'Status: Not Found'}`}
        >
            <h3 className="text-sm sm:text-base font-bold mb-1">{bias.name}</h3>
            <p className="text-xs text-gray-300 hidden sm:block">{bias.description}</p>
            {isFound && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
                    <svg className="w-12 h-12 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            )}
        </div>
    );
};

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}
const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={onClose}>
        <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl relative p-6 sm:p-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors">
                    <CloseIcon className="w-6 h-6"/>
                </button>
            </div>
            {children}
        </div>
    </div>
);

interface UploadModalProps {
    bias: Bias;
    onClose: () => void;
    onSubmit: (evidence: Evidence) => void;
}
const UploadModal: React.FC<UploadModalProps> = ({ bias, onClose, onSubmit }) => {
    const [brand, setBrand] = useState('');
    const [notes, setNotes] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImage(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (brand && preview) {
            // In a real app, upload image to storage and get URL.
            // For this prototype, we'll use the base64 preview URL.
            // TODO: Replace with Firebase Storage upload logic
            onSubmit({ brand, notes, imageUrl: preview, timestamp: Date.now() });
        }
    };

    return (
        <Modal title={bias.name} onClose={onClose}>
            <p className="text-gray-400 mb-4">{bias.example}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
                <input type="text" value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand / Location *" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500" required />
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"></textarea>
                
                <label htmlFor="file-upload" className="w-full flex flex-col items-center justify-center px-4 py-6 bg-gray-700 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-600">
                    {preview ? (
                        <img src={preview} alt="Image preview" className="max-h-40 rounded-lg object-contain" />
                    ) : (
                        <div className="text-center">
                            <CameraIcon className="w-12 h-12 mx-auto text-gray-400" />
                            <p className="mt-2 text-sm text-gray-400">Click to upload photo</p>
                        </div>
                    )}
                </label>
                <input id="file-upload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" required />
                
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:opacity-90 transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!brand || !image}>
                    Submit Evidence
                </button>
            </form>
        </Modal>
    );
};

const LeaderboardModal: React.FC<{ scores: PlayerScore[]; onClose: () => void; }> = ({ scores, onClose }) => {
    return (
        <Modal title="Leaderboard" onClose={onClose}>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {scores.length > 0 ? scores.map((player, index) => (
                    <div key={`${player.name}-${player.startup}-${index}`} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                        <div className="flex items-center gap-3">
                            <span className="w-8 text-lg font-bold text-gray-400 flex-shrink-0 text-center">{index + 1}</span>
                            <div>
                                <p className="font-semibold">{player.name}</p>
                                <p className="text-xs text-purple-300">{player.startup}</p>
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                           <p className="font-bold text-cyan-400">{player.score} <span className="text-sm font-normal text-gray-300">found</span></p>
                        </div>
                    </div>
                )) : (
                    <p className="text-center text-gray-400 py-8">No scores yet. Be the first to get on the board!</p>
                )}
            </div>
        </Modal>
    );
}

const EndGameModal: React.FC<{ onClose: () => void; onRestart: () => void, gameState: GameState, winPattern: string | null }> = ({ onClose, onRestart, gameState, winPattern }) => {
    const foundCount = Object.keys(gameState.foundEvidence).length;
    const timeTaken = gameState.startTime ? Math.min(Math.floor((Date.now() - gameState.startTime) / 1000), GAME_DURATION_SECONDS) : GAME_DURATION_SECONDS;
    const timeString = `${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s`;

    return (
        <Modal title={gameState.status === 'finished' ? "Time's Up!" : "Game Over"} onClose={onClose}>
            <div className="text-center space-y-4">
                {winPattern && <p className="text-3xl font-bold text-yellow-400 animate-pulse">{winPattern}</p>}
                <p className="text-lg">You found <span className="font-bold text-cyan-400 text-xl">{foundCount}</span> biases.</p>
                <p className="text-lg">Total time: <span className="font-bold text-cyan-400 text-xl">{timeString}</span></p>
                <div className="flex gap-4 pt-4">
                    <button onClick={onRestart} className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:opacity-90 transition-transform transform hover:scale-105">
                        Play Again
                    </button>
                    <button onClick={onClose} className="flex-1 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition">
                        View Board
                    </button>
                </div>
            </div>
        </Modal>
    );
};
