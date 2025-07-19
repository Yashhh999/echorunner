import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, RotateCcw, Play, Pause, Settings, Zap, Save, X, Home, Trophy, Info } from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  revealed: boolean;
  revealTimer: number;
}

interface Echo {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'nightmare';
type GameMode = 'limited' | 'infinite';

interface DifficultySettings {
  echoCount: number;
  echoInterval: number;
  echoMaxRadius: number;
  echoSpeed: number;
  echoRevealDuration: number;
  waveOpacityDecay: number;
  obstacleSpawnRate: number;
  gameSpeedMultiplier: number;
}

interface GameSettings {
  difficulty: Difficulty;
  gameMode: GameMode;
  soundEnabled: boolean;
}

interface HighScore {
  score: number;
  
  difficulty: Difficulty;
  gameMode: GameMode;
  date: string;
}

const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PLAYER_SIZE = 20;
const OBSTACLE_WIDTH = 30;
const OBSTACLE_HEIGHT = 60;

const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: {
    echoCount: 8,
    echoInterval: 800,
    echoMaxRadius: 180,
    echoSpeed: 2,
    echoRevealDuration: 4000,
    waveOpacityDecay: 0.015,
    obstacleSpawnRate: 0.2,
    gameSpeedMultiplier: 0.8
  },
  medium: {
    echoCount: 5,
    echoInterval: 1200,
    echoMaxRadius: 140,
    echoSpeed: 2.5,
    echoRevealDuration: 3000,
    waveOpacityDecay: 0.02,
    obstacleSpawnRate: 0.3,
    gameSpeedMultiplier: 1.0
  },
  hard: {
    echoCount: 3,
    echoInterval: 1800,
    echoMaxRadius: 100,
    echoSpeed: 3,
    echoRevealDuration: 2000,
    waveOpacityDecay: 0.025,
    obstacleSpawnRate: 0.4,
    gameSpeedMultiplier: 1.3
  },
  nightmare: {
    echoCount: 2,
    echoInterval: 2500,
    echoMaxRadius: 80,
    echoSpeed: 4,
    echoRevealDuration: 1500,
    waveOpacityDecay: 0.03,
    obstacleSpawnRate: 0.5,
    gameSpeedMultiplier: 1.6
  }
};

function App() {
  const [gameState, setGameState] = useState<'menu' | 'settings' | 'playing' | 'paused' | 'gameOver' | 'highScores' | 'tutorial'>('menu');
  const [settings, setSettings] = useState<GameSettings>({
    difficulty: 'medium',
    gameMode: 'limited',
    soundEnabled: true
  });
  const [tempSettings, setTempSettings] = useState<GameSettings>(settings);
  const [playerPos, setPlayerPos] = useState<Position>({ x: 100, y: GAME_HEIGHT / 2 });
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [score, setScore] = useState(0);
  const [pingsRemaining, setPingsRemaining] = useState(5);
  const [lastPingTime, setLastPingTime] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(2);
  const [collisionFlash, setCollisionFlash] = useState(false);
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  
  const gameLoopRef = useRef<number>();
  const keysRef = useRef<Set<string>>(new Set());
  const obstacleIdRef = useRef(0);
  const echoIdRef = useRef(0);

  const currentSettings = DIFFICULTY_SETTINGS[settings.difficulty];

  useEffect(() => {
    const savedSettings = localStorage.getItem('echoRunnerSettings');
    const savedHighScores = localStorage.getItem('echoRunnerHighScores');
    
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
      setTempSettings(parsed);
    }
    
    if (savedHighScores) {
      setHighScores(JSON.parse(savedHighScores));
    }
  }, []);

  const saveSettings = useCallback(() => {
    localStorage.setItem('echoRunnerSettings', JSON.stringify(tempSettings));
    setSettings(tempSettings);
    setSettingsChanged(false);
  }, [tempSettings]);

  const saveHighScore = useCallback((finalScore: number) => {
    const newScore: HighScore = {
      score: finalScore,
      difficulty: settings.difficulty,
      gameMode: settings.gameMode,
      date: new Date().toLocaleDateString()
    };
    
    const updatedScores = [...highScores, newScore]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10); 
    
    setHighScores(updatedScores);
    localStorage.setItem('echoRunnerHighScores', JSON.stringify(updatedScores));
  }, [settings, highScores]);

  useEffect(() => {
    const hasChanged = JSON.stringify(settings) !== JSON.stringify(tempSettings);
    setSettingsChanged(hasChanged);
  }, [settings, tempSettings]);

  const initGame = useCallback(() => {
    setPlayerPos({ x: 100, y: GAME_HEIGHT / 2 });
    setObstacles([]);
    setEchoes([]);
    setScore(0);
    setPingsRemaining(settings.gameMode === 'infinite' ? 999 : currentSettings.echoCount);
    setLastPingTime(0);
    setGameSpeed(2 * currentSettings.gameSpeedMultiplier);
    setCollisionFlash(false);
    obstacleIdRef.current = 0;
    echoIdRef.current = 0;
  }, [currentSettings, settings.gameMode]);

  const generateObstacle = useCallback((): Obstacle => {
    return {
      id: obstacleIdRef.current++,
      x: GAME_WIDTH + 50,
      y: Math.random() * (GAME_HEIGHT - OBSTACLE_HEIGHT - 100) + 50,
      width: OBSTACLE_WIDTH,
      height: OBSTACLE_HEIGHT,
      revealed: false,
      revealTimer: 0
    };
  }, []);

  const createEcho = useCallback((x: number, y: number) => {
    const newEcho: Echo = {
      id: echoIdRef.current++,
      x,
      y,
      radius: 0,
      maxRadius: currentSettings.echoMaxRadius,
      opacity: 1,
      speed: currentSettings.echoSpeed
    };
    setEchoes(prev => [...prev, newEcho]);
  }, [currentSettings]);

  const handlePing = useCallback(() => {
    const now = Date.now();
    const canPing = settings.gameMode === 'infinite' || pingsRemaining > 0;
    const cooldownPassed = now - lastPingTime > currentSettings.echoInterval;
    
    if (canPing && cooldownPassed && gameState === 'playing') {
      createEcho(playerPos.x, playerPos.y);
      if (settings.gameMode === 'limited') {
        setPingsRemaining(prev => prev - 1);
      }
      setLastPingTime(now);
    }
  }, [pingsRemaining, lastPingTime, playerPos, gameState, createEcho, currentSettings, settings.gameMode]);

  const checkCollisions = useCallback(() => {
    for (const obstacle of obstacles) {
      if (
        playerPos.x + PLAYER_SIZE > obstacle.x &&
        playerPos.x < obstacle.x + obstacle.width &&
        playerPos.y + PLAYER_SIZE > obstacle.y &&
        playerPos.y < obstacle.y + obstacle.height
      ) {
        setCollisionFlash(true);
        setTimeout(() => setCollisionFlash(false), 200);
        saveHighScore(score);
        setGameState('gameOver');
        return true;
      }
    }
    return false;
  }, [playerPos, obstacles, score, saveHighScore]);

  const gameLoop = useCallback(() => {
    if (gameState !== 'playing') return;

    setPlayerPos(prev => {
      let newY = prev.y;
      if (keysRef.current.has('ArrowUp') || keysRef.current.has('w')) {
        newY = Math.max(0, prev.y - 5);
      }
      if (keysRef.current.has('ArrowDown') || keysRef.current.has('s')) {
        newY = Math.min(GAME_HEIGHT - PLAYER_SIZE, prev.y + 5);
      }
      return { ...prev, y: newY };
    });

    setObstacles(prev => {
      const moved = prev.map(obstacle => ({
        ...obstacle,
        x: obstacle.x - gameSpeed,
        revealTimer: Math.max(0, obstacle.revealTimer - 16)
      })).filter(obstacle => obstacle.x > -obstacle.width);

      if (moved.length === 0 || moved[moved.length - 1].x < GAME_WIDTH - 200) {
        if (Math.random() < currentSettings.obstacleSpawnRate) {
          moved.push(generateObstacle());
        }
      }

      return moved;
    });

    setEchoes(prev => prev.map(echo => ({
      ...echo,
      radius: Math.min(echo.radius + echo.speed, echo.maxRadius),
      opacity: Math.max(0, echo.opacity - currentSettings.waveOpacityDecay)
    })).filter(echo => echo.opacity > 0));

    setObstacles(prev => prev.map(obstacle => {
      let revealed = obstacle.revealed;
      let revealTimer = obstacle.revealTimer;

      echoes.forEach(echo => {
        const distance = Math.sqrt(
          Math.pow(echo.x - (obstacle.x + obstacle.width / 2), 2) +
          Math.pow(echo.y - (obstacle.y + obstacle.height / 2), 2)
        );
        if (distance <= echo.radius + 20) {
          revealed = true;
          revealTimer = currentSettings.echoRevealDuration;
        }
      });

      return { ...obstacle, revealed, revealTimer };
    }));

    setScore(prev => prev + 1);

    setGameSpeed(prev => prev + 0.001 * currentSettings.gameSpeedMultiplier);

    if (settings.gameMode === 'limited' && score > 0 && score % 800 === 0) {
      setPingsRemaining(prev => Math.min(currentSettings.echoCount, prev + 1));
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, echoes, gameSpeed, score, generateObstacle, currentSettings, settings.gameMode]);

  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, gameLoop]);

  useEffect(() => {
    if (gameState === 'playing') {
      checkCollisions();
    }
  }, [playerPos, checkCollisions, gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handlePing();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (gameState === 'playing' || gameState === 'paused') {
          if (gameState === 'playing') {
            setGameState('paused');
          } else {
            setGameState('playing');
          }
        } else if (gameState === 'settings' || gameState === 'highScores' || gameState === 'tutorial') {
          setGameState('menu');
        }
      }
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        if (gameState === 'playing' || gameState === 'paused') {
          setShowExitConfirm(true);
        } else if (gameState !== 'menu') {
          setGameState('menu');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handlePing, gameState]);

  const startGame = () => {
    initGame();
    setGameState('playing');
  };

  const togglePause = () => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
  };

  const restartGame = () => {
    initGame();
    setGameState('playing');
  };

  const resetSettings = () => {
    const defaultSettings: GameSettings = {
      difficulty: 'medium',
      gameMode: 'limited',
      soundEnabled: true
    };
    setTempSettings(defaultSettings);
  };

  const getDifficultyColor = (diff: Difficulty) => {
    const colors = {
      easy: 'text-green-400',
      medium: 'text-yellow-400',
      hard: 'text-orange-400',
      nightmare: 'text-red-400'
    };
    return colors[diff];
  };

  const getPingCooldownProgress = () => {
    const timeSinceLastPing = Date.now() - lastPingTime;
    const progress = Math.min(timeSinceLastPing / currentSettings.echoInterval, 1);
    return progress;
  };

  const getBestScore = () => {
    return highScores
      .filter(score => score.difficulty === settings.difficulty && score.gameMode === settings.gameMode)
      .reduce((best, current) => current.score > best ? current.score : best, 0);
  };

  const handleExitToMenu = () => {
    if (gameState === 'playing' || gameState === 'paused') {
      saveHighScore(score);
    }
    setShowExitConfirm(false);
    setGameState('menu');
  };

  const cancelExit = () => {
    setShowExitConfirm(false);
    if (gameState === 'paused') {
      setGameState('playing');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
            Echo Runner
          </h1>
          <p className="text-gray-400">Navigate the dark world using sound echoes</p>
        </div>

        <div className="relative mx-auto bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
          <div 
            className="relative"
            style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}
          >
            <div 
              className={`absolute inset-0 bg-black transition-all duration-200 ${
                collisionFlash ? 'bg-red-500 bg-opacity-30' : ''
              }`}
            >
              <div
                className="absolute bg-blue-400 rounded-full shadow-lg shadow-blue-400/50 transition-all duration-75"
                style={{
                  left: playerPos.x,
                  top: playerPos.y,
                  width: PLAYER_SIZE,
                  height: PLAYER_SIZE,
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.6)'
                }}
              />

              {obstacles.map(obstacle => (
                <div
                  key={obstacle.id}
                  className={`absolute bg-red-500 transition-opacity duration-300 ${
                    obstacle.revealed && obstacle.revealTimer > 0
                      ? 'opacity-80 shadow-lg shadow-red-500/50'
                      : 'opacity-10'
                  }`}
                  style={{
                    left: obstacle.x,
                    top: obstacle.y,
                    width: obstacle.width,
                    height: obstacle.height,
                    boxShadow: obstacle.revealed && obstacle.revealTimer > 0 
                      ? '0 0 20px rgba(239, 68, 68, 0.6)' 
                      : 'none'
                  }}
                />
              ))}

              {echoes.map(echo => (
                <div
                  key={echo.id}
                  className="absolute border-2 border-blue-400 rounded-full pointer-events-none"
                  style={{
                    left: echo.x - echo.radius,
                    top: echo.y - echo.radius,
                    width: echo.radius * 2,
                    height: echo.radius * 2,
                    opacity: echo.opacity,
                    borderWidth: Math.max(1, 3 - echo.radius / 30),
                    boxShadow: `0 0 ${echo.radius / 4}px rgba(59, 130, 246, ${echo.opacity})`
                  }}
                />
              ))}

              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at ${playerPos.x + PLAYER_SIZE/2}px ${playerPos.y + PLAYER_SIZE/2}px, 
                    transparent 40px, 
                    rgba(0,0,0,0.3) 80px, 
                    rgba(0,0,0,0.8) 150px, 
                    rgba(0,0,0,0.95) 300px)`
                }}
              />
            </div>

            {showExitConfirm && (
              <div className="absolute inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
                <div className="text-center bg-gray-800 p-6 rounded-lg border border-red-500">
                  <h2 className="text-2xl font-bold text-red-400 mb-4">Exit to Menu?</h2>
                  <p className="text-gray-300 mb-2">Current Score: {score.toLocaleString()}</p>
                  <p className="text-gray-400 mb-6">Your progress will be saved to high scores</p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={cancelExit}
                      className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      Cancel (ESC)
                    </button>
                    <button
                      onClick={handleExitToMenu}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      Exit to Menu
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gameState === 'tutorial' && (
              <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center">
                <div className="text-center max-w-lg p-6">
                  <h2 className="text-3xl font-bold text-blue-400 mb-6">How to Play</h2>
                  <div className="text-left space-y-4 mb-8">
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-blue-300 mb-2">Movement</h3>
                      <p className="text-gray-300">Use ↑/↓ arrow keys or W/S to move up and down</p>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-blue-300 mb-2">Echo System</h3>
                      <p className="text-gray-300">Press SPACE to emit sound waves that reveal obstacles temporarily</p>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-blue-300 mb-2">Objective</h3>
                      <p className="text-gray-300">Avoid red obstacles and survive as long as possible. Use echoes wisely!</p>
                    </div>
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-blue-300 mb-2">Game Modes</h3>
                      <p className="text-gray-300">Limited: Fixed number of echoes | Infinite: Unlimited echoes with cooldowns</p>
                    </div>
                  </div>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setGameState('menu')}
                      className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
                    >
                      Back to Menu
                    </button>
                    <button
                      onClick={() => {
                        initGame();
                        setGameState('playing');
                      }}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Start Playing!
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gameState === 'settings' && (
              <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center overflow-y-auto">
              <div className="text-center max-w-md p-6">
                <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-blue-400">Settings</h2>
                <button
                  onClick={() => setGameState('menu')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
                </div>
                
                <div className="mb-6">
                <h3 className="text-xl font-semibold mb-3">Game Mode</h3>
                <div className="flex gap-2 justify-center">
                  <button
                  onClick={() => setTempSettings(prev => ({ ...prev, gameMode: 'limited' }))}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    tempSettings.gameMode === 'limited' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  >
                  Limited Echoes
                  </button>
                  <button
                  onClick={() => setTempSettings(prev => ({ ...prev, gameMode: 'infinite' }))}
                  className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                    tempSettings.gameMode === 'infinite' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  >
                  <Zap size={16} />
                  Infinite Echoes
                  </button>
                </div>
                </div>

                <div className="mb-6">
                <h3 className="text-xl font-semibold mb-3">Difficulty</h3>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(DIFFICULTY_SETTINGS) as Difficulty[]).map(diff => (
                  <button
                    key={diff}
                    onClick={() => setTempSettings(prev => ({ ...prev, difficulty: diff }))}
                    className={`px-4 py-2 rounded-lg transition-colors capitalize ${
                    tempSettings.difficulty === diff 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span className={getDifficultyColor(diff)}>
                    {diff}
                    </span>
                  </button>
                  ))}
                </div>
                </div>

                <div className="mb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span>Sound Effects</span>
                  <button
                  onClick={() => setTempSettings(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    tempSettings.soundEnabled ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                  >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    tempSettings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                  </button>
                </div>
                </div>

                <div className="mb-6 text-sm text-gray-400 text-left bg-gray-800 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Current Settings Preview:</h4>
                <div className="space-y-1">
                  <p>• Echo Count: {tempSettings.gameMode === 'infinite' ? '∞' : DIFFICULTY_SETTINGS[tempSettings.difficulty].echoCount}</p>
                  <p>• Echo Interval: {DIFFICULTY_SETTINGS[tempSettings.difficulty].echoInterval}ms</p>
                  <p>• Echo Radius: {DIFFICULTY_SETTINGS[tempSettings.difficulty].echoMaxRadius}px</p>
                  <p>• Reveal Duration: {DIFFICULTY_SETTINGS[tempSettings.difficulty].echoRevealDuration}ms</p>
                  <p>• Game Speed: {DIFFICULTY_SETTINGS[tempSettings.difficulty].gameSpeedMultiplier}x</p>
                </div>
                </div>

                <div className="flex gap-2 justify-center">
                <button
                  onClick={resetSettings}
                  className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={saveSettings}
                  disabled={!settingsChanged}
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  settingsChanged 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <Save size={16} />
                  {settingsChanged ? 'Save Changes' : 'Saved'}
                </button>
                </div>
              </div>
              </div>
            )}

            {gameState === 'highScores' && (
              <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center">
                <div className="text-center max-w-lg p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-yellow-400 flex items-center gap-2">
                      <Trophy size={32} />
                      High Scores
                    </h2>
                    <button
                      onClick={() => setGameState('menu')}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  
                  {highScores.length === 0 ? (
                    <div className="text-gray-400 py-8">
                      <p>No high scores yet!</p>
                      <p className="text-sm mt-2">Play a game to set your first record.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {highScores.map((score, index) => (
                        <div 
                          key={index}
                          className={`flex justify-between items-center p-3 rounded-lg ${
                            index === 0 ? 'bg-yellow-900 bg-opacity-30 border border-yellow-600' :
                            index === 1 ? 'bg-gray-700 bg-opacity-50' :
                            index === 2 ? 'bg-orange-900 bg-opacity-30' :
                            'bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${
                              index === 0 ? 'text-yellow-400' :
                              index === 1 ? 'text-gray-300' :
                              index === 2 ? 'text-orange-400' :
                              'text-gray-400'
                            }`}>
                              #{index + 1}
                            </span>
                            <div className="text-left">
                              <div className="font-semibold">{score.score.toLocaleString()}</div>
                              <div className="text-xs text-gray-400">
                                {score.date} • <span className={getDifficultyColor(score.difficulty)}>{score.difficulty}</span> • {score.gameMode}
                              </div>
                            </div>
                          </div>
                          {score.gameMode === 'infinite' && (
                            <Zap size={16} className="text-purple-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <button
                    onClick={() => setGameState('menu')}
                    className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    Back to Menu
                  </button>
                </div>
              </div>
            )}

            {gameState === 'gameOver' && (
              <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-red-400 mb-4">Game Over!</h2>
                  <p className="text-xl mb-2">Final Score: {score.toLocaleString()}</p>
                  <p className="text-gray-400 mb-2">
                    Difficulty: <span className={getDifficultyColor(settings.difficulty)}>{settings.difficulty}</span>
                  </p>
                  <p className="text-gray-400 mb-2">
                    Mode: {settings.gameMode === 'infinite' ? 'Infinite Echoes' : 'Limited Echoes'}
                  </p>
                  {getBestScore() > 0 && (
                    <p className="text-yellow-400 mb-6">
                      Best: {getBestScore().toLocaleString()}
                      {score > getBestScore() && <span className="text-green-400 ml-2">NEW RECORD! 🎉</span>}
                    </p>
                  )}
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setGameState('menu')}
                      className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <Home size={20} />
                      Menu
                    </button>
                    <button
                      onClick={restartGame}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <RotateCcw size={20} />
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gameState === 'paused' && (
              <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-blue-400 mb-4">Paused</h2>
                  <p className="text-gray-400 mb-6">Press ESC to resume</p>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setShowExitConfirm(true)}
                      className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Home size={16} />
                      Menu (Q)
                    </button>
                    <button
                      onClick={togglePause}
                      className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2"
                    >
                      <Play size={20} />
                      Resume
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gameState === 'menu' && (
              <div className="absolute inset-0 bg-black bg-opacity-95 flex items-center justify-center">
                <div className="text-center max-w-lg p-8">
                  <div className="mb-8">
                    <h2 className="text-4xl font-bold text-blue-400 mb-4">Echo Runner</h2>
                    <p className="text-gray-300 text-lg mb-6">Navigate through darkness using sound echoes</p>
                    
                    <div className="bg-gray-800 rounded-lg p-6 mb-6">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-400">Mode</p>
                          <p className="text-blue-400 font-semibold">
                            {settings.gameMode === 'infinite' ? 'Infinite Echoes' : 'Limited Echoes'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400">Difficulty</p>
                          <p className={`font-semibold ${getDifficultyColor(settings.difficulty)}`}>
                            {settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1)}
                          </p>
                        </div>
                        {getBestScore() > 0 && (
                          <>
                            <div>
                              <p className="text-gray-400">Best Score</p>
                              <p className="text-yellow-400 font-semibold">{getBestScore().toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-gray-400">Total Scores</p>
                              <p className="text-purple-400 font-semibold">{highScores.length}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <button
                      onClick={startGame}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-4 rounded-lg font-bold text-xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-3"
                    >
                      <Play size={24} />
                      Start Game
                    </button>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => setGameState('settings')}
                        className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <Settings size={18} />
                        Settings
                      </button>
                      <button
                        onClick={() => setGameState('highScores')}
                        className="bg-yellow-700 hover:bg-yellow-600 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <Trophy size={18} />
                        Scores
                      </button>
                      <button
                        onClick={() => setGameState('tutorial')}
                        className="bg-purple-700 hover:bg-purple-600 px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        <Info size={18} />
                        Tutorial
                      </button>
                    </div>
                  </div>

                  <div className="mt-8 text-sm text-gray-400 bg-gray-800 bg-opacity-50 p-4 rounded-lg">
                    <p className="font-semibold mb-2">Quick Controls:</p>
                    <div className="flex justify-between">
                      <span>Movement: ↑↓ or W/S</span>
                      <span>Echo: SPACE</span>
                      <span>Pause: ESC</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {gameState === 'playing' && (
          <div className="flex justify-between items-center mt-4 text-lg">
            <div className="flex items-center gap-4">
              <div className="text-blue-400">
                Score: <span className="font-bold">{score.toLocaleString()}</span>
              </div>
              <div className="text-purple-400">
                Speed: <span className="font-bold">{gameSpeed.toFixed(1)}x</span>
              </div>
              <div className={getDifficultyColor(settings.difficulty)}>
                {settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1)}
              </div>
              {getBestScore() > 0 && (
                <div className="text-yellow-400">
                  Best: <span className="font-bold">{getBestScore().toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {settings.gameMode === 'infinite' ? (
                <div className="flex items-center gap-2">
                  <Zap size={20} className="text-purple-400" />
                  <div className="text-purple-400">
                    Infinite Mode
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Volume2 size={20} className="text-blue-400" />
                  <div className="text-blue-400">
                    Pings: <span className="font-bold">{pingsRemaining}</span>
                  </div>
                </div>
              )}
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-400 transition-all duration-100"
                  style={{ width: `${getPingCooldownProgress() * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="flex justify-center gap-4 mt-4">
            <button
              onClick={togglePause}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <Pause size={16} />
              Pause (ESC)
            </button>
            <button
              onClick={() => setShowExitConfirm(true)}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <Home size={16} />
              Menu (Q)
            </button>
            <button
              onClick={handlePing}
              disabled={Date.now() - lastPingTime < currentSettings.echoInterval}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <Volume2 size={16} />
              Ping (SPACE)
            </button>
          </div>
        )}

        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Navigate through the darkness using sound. Each echo reveals what lies ahead.</p>
          <p className="mt-1">Settings are automatically saved. Press Q from anywhere to return to menu.</p>
          <p className="mt-1">Use SPACE to ping, WASD/Arrows to move, ESC to pause.</p>
        </div>
      </div>
    </div>
  );
}

export default App;