let isSoundOn = true;
let backgroundMusic = null;
let clickSound, winSound, loseSound, drawSound;

let playerScore = 0;
let computerScore = 0;
let round = 1;
let maxRounds = 5;

let mode = "vsPC";

let socket = null;
let room = null;
let opponentChoice = null;
let isPlayerTurn = false;
let isMultiplayerGameActive = false;

// --- URL de votre backend Render.com ---
// REMPLACEZ 'https://votre-nom-de-service.onrender.com' par l'URL réelle de votre service Render
const RENDER_BACKEND_URL = 'https://votre-nom-de-service.onrender.com';

function goToLogin() {
  playSound(clickSound);
  window.location.href = "login.html";
}

function goToRegister() {
  playSound(clickSound);
  window.location.href = "register.html";
}

function backToLogin() {
  playSound(clickSound);
  window.location.href = "login.html";
}

async function register() {
    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    playSound(clickSound);

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password }),
            credentials: 'include'
        });

        const data = await response.json();
        alert(data.message);
        if (response.ok) {
            backToLogin();
        }
    } catch (error) {
        console.error('Error during registration:', error);
        alert('An error occurred during registration. Please try again.');
    }
}

async function login() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    playSound(clickSound);

    try {
        const response = await fetch(`${RENDER_BACKEND_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            localStorage.setItem('username', data.username);
            goToPlayerChoose();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error during login:', error);
        alert('An error occurred during login. Please try again.');
    }
}

function goToPlayerChoose() {
  playSound(clickSound);
  window.location.href = "playerChoose.html";
}

function playVsPC() {
  playSound(clickSound);
  mode = "vsPC";
  localStorage.setItem("mode", "vsPC");
  window.location.href = "game.html";
}

function playVsPlayer() {
  playSound(clickSound);
  mode = "vsPlayer";
  localStorage.setItem("mode", "vsPlayer");
  const statusMessage = document.getElementById("statusMessage");
  if (statusMessage) {
    statusMessage.textContent = "Recherche d'adversaire...";
  }
  
  initSocket();
  socket.emit('findOpponent');
}

function initSocket() {
  if (socket) {
    socket.disconnect();
  }
  // --- Connexion Socket.IO à l'URL de Render ---
  socket = io(RENDER_BACKEND_URL, {
    withCredentials: true
  });

  socket.on('waitingForOpponent', () => {
    const statusMessage = document.getElementById("statusMessage");
    if (statusMessage) {
      statusMessage.textContent = "En attente d'un adversaire...";
    }
  });

  socket.on('opponentFound', (data) => {
    room = data.roomId;
    isMultiplayerGameActive = true;
    localStorage.setItem('room', room);
    console.log("Adversaire trouvé! Salle:", room);
    window.location.href = "game.html";
  });

  socket.on('roundResult', (data) => {
    updateScores(data.scores);
    displayRoundResult(data);
    
    if (data.winner === socket.id) {
        playSound(winSound);
    } else if (data.winner === null && data.draw) {
        playSound(drawSound);
    } else {
        playSound(loseSound);
    }
  });

  socket.on('nextRound', (data) => {
    round = data.round;
    resetGameForNextRound();
  });

  socket.on('gameOver', (data) => {
    displayEndScreen(data.finalWinner, data.finalScores);
    isMultiplayerGameActive = false;
    room = null;
    localStorage.removeItem('room');
  });

  socket.on('opponentDisconnected', () => {
    alert("Votre adversaire s'est déconnecté. La partie est terminée.");
    isMultiplayerGameActive = false;
    room = null;
    localStorage.removeItem('room');
    window.location.href = 'playerChoose.html';
  });

  socket.on('connect_error', (err) => {
    console.error("Erreur de connexion Socket.IO:", err);
    if (window.location.pathname.includes("game.html") && isMultiplayerGameActive) {
      alert("Problème de connexion au serveur. Veuillez vérifier votre connexion.");
      window.location.href = 'playerChoose.html';
    }
  });
}

function updatePlayerLabels() {
    const playerLabel = document.getElementById("playerLabel");
    const opponentLabel = document.getElementById("opponentLabel");
    const username = localStorage.getItem('username');
    if (playerLabel && username) {
        playerLabel.textContent = username;
    }
    if (opponentLabel && mode === "vsPlayer") {
        opponentLabel.textContent = "Adversaire";
    }
}

function choose(choice) {
    playSound(clickSound);

    const playerHand = document.getElementById("playerChoice");
    const computerHand = document.getElementById("computerChoice");

    playerHand.src = "fist-left.png";
    computerHand.src = "fist-right.png";
    playerHand.classList.add("animated");
    computerHand.classList.add("animated");

    document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = true);

    setTimeout(() => {
        playerHand.classList.remove("animated");
        computerHand.classList.remove("animated");

        if (mode === "vsPC") {
            playVsPCChoice(choice);
        } else if (mode === "vsPlayer" && room) {
            if (!isPlayerTurn) {
                let playerChoiceImage = "";
                if (choice === "rock") playerChoiceImage = "fist-left.png";
                else if (choice === "paper") playerChoiceImage = "feuill.png";
                else if (choice === "scissors") playerChoiceImage = "cise1.png";
                document.getElementById('playerChoice').src = playerChoiceImage;
                
                document.getElementById('computerChoice').src = 'fist-right.png';

                socket.emit('playerChoice', { roomId: room, choice: choice });
                isPlayerTurn = true;
            } else {
                alert("Veuillez attendre que votre adversaire joue ou que le tour se termine.");
                document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = false);
            }
        }
    }, 800);
}

function playVsPCChoice(playerChoice) {
    const choices = ["rock", "paper", "scissors"];
    const computerChoice = choices[Math.floor(Math.random() * choices.length)];

    let playerChoiceImage = "";
    if (playerChoice === "rock") playerChoiceImage = "fist-left.png";
    else if (playerChoice === "paper") playerChoiceImage = "feuill.png";
    else if (playerChoice === "scissors") playerChoiceImage = "cise1.png";
    document.getElementById('playerChoice').src = playerChoiceImage;

    let computerChoiceImage = "";
    if (computerChoice === "rock") computerChoiceImage = "fist-right.png";
    else if (computerChoice === "paper") computerChoiceImage = "feuill1.png";
    else computerChoiceImage = "cise.png";
    document.getElementById('computerChoice').src = computerChoiceImage;

    setTimeout(() => {
        let result = "";
        let winner = null;
        let draw = false;

        if (playerChoice === computerChoice) {
            result = "Égalité !";
            draw = true;
        } else if (
            (playerChoice === "rock" && computerChoice === "scissors") ||
            (playerChoice === "paper" && computerChoice === "rock") ||
            (playerChoice === "scissors" && computerChoice === "paper")
        ) {
            result = "Vous gagnez !";
            playerScore++;
            winner = "player";
        } else {
            result = "L'ordinateur gagne !";
            computerScore++;
            winner = "computer";
        }

        document.getElementById("playerScore").textContent = playerScore;
        document.getElementById("computerScore").textContent = computerScore;

        const roundResultDiv = document.getElementById("roundResult");
        if (roundResultDiv) {
            roundResultDiv.textContent = result;
            roundResultDiv.style.display = 'block';
        }

        if (winner === "player") {
            playSound(winSound);
        } else if (winner === "computer") {
            playSound(loseSound);
        } else {
            playSound(drawSound);
        }

        round++;
        if (round > maxRounds) {
            let finalWinnerText = '';
            if (playerScore > computerScore) {
                finalWinnerText = "Vous avez gagné la partie !";
                playSound(winSound);
            } else if (computerScore > playerScore) {
                finalWinnerText = "L'ordinateur a gagné la partie !";
                playSound(loseSound);
            } else {
                finalWinnerText = "La partie est une égalité !";
                playSound(drawSound);
            }
            displayEndScreen(finalWinnerText, { playerScore: playerScore, computerScore: computerScore });
            saveScoreboard(playerScore, computerScore);
        } else {
            setTimeout(() => {
                resetGameForNextRound();
                document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = false);
            }, 1500);
        }
    }, 500);
}

function updateScores(scores) {
    if (mode === "vsPlayer" && room) {
        const player1Id = Object.keys(scores)[0];
        const player2Id = Object.keys(scores)[1];

        const currentPlayerScore = scores[socket.id];
        const opponentId = socket.id === player1Id ? player2Id : player1Id;
        const currentOpponentScore = scores[opponentId];
        
        document.getElementById("playerScore").textContent = currentPlayerScore;
        document.getElementById("computerScore").textContent = currentOpponentScore;
    }
}

function displayRoundResult(data) {
    const roundResultDiv = document.getElementById("roundResult");
    let resultText = '';
    const player1Name = localStorage.getItem('username');
    const player2Name = "Adversaire";

    const currentPlayerChoice = data.player1Id === socket.id ? data.player1Choice : data.player2Choice;
    const opponentPlayerChoice = data.player1Id === socket.id ? data.player2Choice : data.player1Choice;

    let currentPlayerChoiceImage = "";
    if (currentPlayerChoice === "rock") currentPlayerChoiceImage = "fist-left.png";
    else if (currentPlayerChoice === "paper") currentPlayerChoiceImage = "feuill.png";
    else if (currentPlayerChoice === "scissors") currentPlayerChoiceImage = "cise1.png";
    document.getElementById('playerChoice').src = currentPlayerChoiceImage;

    let opponentPlayerChoiceImage = "";
    if (opponentPlayerChoice === "rock") opponentPlayerChoiceImage = "fist-right.png";
    else if (opponentPlayerChoice === "paper") opponentPlayerChoiceImage = "feuill1.png";
    else opponentPlayerChoiceImage = "cise.png";
    document.getElementById('computerChoice').src = opponentPlayerChoiceImage;

    setTimeout(() => {
        if (data.draw) {
            resultText = "Égalité !";
        } else if (data.winner === socket.id) {
            resultText = "Vous gagnez ce tour !";
        } else {
            resultText = "Votre adversaire gagne ce tour !";
        }
        
        if (roundResultDiv) {
            roundResultDiv.textContent = resultText;
            roundResultDiv.style.display = 'block';
        }
        isPlayerTurn = false;
        document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = false);

    }, 500);
}

function resetGameForNextRound() {
    const roundResultDiv = document.getElementById("roundResult");
    if (roundResultDiv) {
        roundResultDiv.style.display = 'none';
    }
    document.getElementById('playerChoice').src = 'fist-left.png';
    document.getElementById('computerChoice').src = 'fist-right.png';
}

function displayEndScreen(winnerText, finalScores) {
    const endScreen = document.getElementById("endScreen");
    const finalResult = document.getElementById("finalResult");
    const finalPlayerScore = document.getElementById("finalPlayerScore");
    const finalComputerScore = document.getElementById("finalComputerScore");

    document.getElementById('gameScreen').style.display = 'none';
    endScreen.style.display = 'flex';

    if (mode === "vsPC") {
        finalResult.textContent = winnerText;
        finalPlayerScore.textContent = `Votre score: ${finalScores.playerScore}`;
        finalComputerScore.textContent = `Score de l'ordinateur: ${finalScores.computerScore}`;
    } else {
        const username = localStorage.getItem('username') || "Vous";
        const opponentName = "Adversaire";

        if (winnerText === socket.id) {
            finalResult.textContent = `${username} a gagné la partie !`;
        } else if (winnerText === null) {
            finalResult.textContent = "La partie est une égalité !";
        } else {
            finalResult.textContent = `${opponentName} a gagné la partie !`;
        }
        
        const player1Id = Object.keys(finalScores)[0];
        const player2Id = Object.keys(finalScores)[1];

        finalPlayerScore.textContent = `${username}: ${finalScores[socket.id]}`;
        const opponentId = socket.id === player1Id ? player2Id : player1Id;
        finalComputerScore.textContent = `${opponentName}: ${finalScores[opponentId]}`;

        saveScoreboard(finalScores[socket.id], finalScores[opponentId]);
    }
}

function replayGame() {
    playSound(clickSound);
    playerScore = 0;
    computerScore = 0;
    round = 1;

    document.getElementById("playerScore").textContent = playerScore;
    document.getElementById("computerScore").textContent = computerScore;
    document.getElementById("endScreen").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
    
    resetGameForNextRound();

    if (mode === "vsPC") {
        document.querySelectorAll('.choice-btn').forEach(btn => btn.disabled = false);
    } else if (mode === "vsPlayer") {
        if (socket && room) {
            socket.emit('findOpponent');
        } else {
            window.location.href = "playerChoose.html";
        }
    }
}

function initMusic() {
  if (!backgroundMusic) {
    backgroundMusic = new Audio('background_music.mp3');
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.5;
  }
}

function loadSoundEffects() {
  clickSound = new Audio('click.mp3');
  winSound = new Audio('win.mp3');
  loseSound = new Audio('lose.mp3');
  drawSound = new Audio('draw.mp3');
}

function toggleSound() {
  isSoundOn = !isSoundOn;
  localStorage.setItem("soundPreference", isSoundOn);
  const soundIcon = document.querySelector(".sound-icon");
  if (soundIcon) {
    soundIcon.textContent = isSoundOn ? "🔊" : "🔇";
  }
  if (isSoundOn) {
    startMusic();
  } else {
    stopMusic();
  }
}

function playSound(sound) {
  if (isSoundOn && sound) {
    sound.currentTime = 0;
    sound.play().catch(e => console.error("Erreur lecture son:", e));
  }
}

function startMusic() {
  if (isSoundOn && backgroundMusic) {
    backgroundMusic.play().catch(e => console.error("Erreur lecture musique:", e));
  }
}

function stopMusic() {
  if (backgroundMusic) {
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
  }
}

function saveScoreboard(playerScore, computerScore) {
  const username = localStorage.getItem('username') || "Joueur Inconnu";
  const scores = JSON.parse(localStorage.getItem('scoreboard')) || [];
  
  scores.push({
    username: username,
    date: new Date().toLocaleDateString(),
    playerScore: playerScore,
    computerScore: computerScore,
    mode: mode
  });
  
  localStorage.setItem('scoreboard', JSON.stringify(scores));
  loadScoreboard();
}

function loadScoreboard() {
  const scoreboard = JSON.parse(localStorage.getItem('scoreboard')) || [];
  const scoreboardList = document.getElementById('scoreboardList');
  if (scoreboardList) {
    scoreboardList.innerHTML = '';
    scoreboard.forEach(score => {
      const li = document.createElement('li');
      li.textContent = `${score.date} - ${score.username} (${score.mode}): Vous ${score.playerScore} - ${score.computerScore}`;
      scoreboardList.appendChild(li);
    });
  }
}

function initGamePages() {
  const savedSound = localStorage.getItem("soundPreference");
  if (savedSound !== null) {
    isSoundOn = savedSound === "true";
  }

  const soundIcon = document.querySelector(".sound-icon");
  if (soundIcon) {
    soundIcon.textContent = isSoundOn ? "🔊" : "🔇";
    soundIcon.addEventListener("click", toggleSound);
  }

  initMusic();
  loadSoundEffects();
  startMusic();
  loadScoreboard();

  const savedMode = localStorage.getItem("mode");
  if (savedMode) {
    mode = savedMode;
  }

  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      playSound(clickSound);
      if (mode === "vsPlayer" && room && isMultiplayerGameActive && socket) {
        socket.emit('leaveRoom', room);
      }
      window.location.href = "playerChoose.html";
    });
  }

  if (window.location.pathname.includes("game.html")) {
    const storedRoom = localStorage.getItem('room');
    if (mode === "vsPlayer" && storedRoom) {
        room = storedRoom;
        isMultiplayerGameActive = true;
        initSocket();
    }
    updatePlayerLabels();
  }
}

function initWelcome() {
  const savedSound = localStorage.getItem("soundPreference");
  if (savedSound !== null) {
    isSoundOn = savedSound === "true";
  }
  const soundIcon = document.querySelector(".sound-icon");
  if (soundIcon) {
    soundIcon.textContent = isSoundOn ? "🔊" : "🔇";
    soundIcon.addEventListener("click", toggleSound);
  }
  initMusic();
  loadSoundEffects();
  startMusic();
}