/** A single-player paddle game with a speed-limited opponent and player. */
export const PING_PONG_HTML = `<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px ui-sans-serif, system-ui, sans-serif; }
  .game {
    max-width: 520px; padding: 16px; border-radius: 16px;
    background: #112724; color: #e8f6ee;
  }
  header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font-size: 18px; }
  output { color: #cae5d8; font-variant-numeric: tabular-nums; }
  #court {
    margin-top: 12px; position: relative; overflow: hidden; aspect-ratio: 480 / 256;
    border-radius: 8px; background: #1e423c;
    box-shadow: inset 0 0 0 1px #46685b; user-select: none;
  }
  #court::before {
    content: ""; position: absolute; inset: 50% 0 auto; border-top: 1px dashed #7a9d90;
  }
  .paddle, #ball { position: absolute; left: 50%; transform: translate(-50%, -50%); }
  .paddle { width: 18.33%; height: 4.69%; border: 0; padding: 0; border-radius: 5px; }
  #opponent { top: 7.81%; background: #b1c5ff; }
  #player { top: 92.19%; background: #f5df86; cursor: grab; touch-action: none; }
  #player::after { content: ""; position: absolute; inset: -8px 0; }
  #player:active { cursor: grabbing; }
  #player:focus-visible { outline: 2px solid white; outline-offset: 3px; }
  #ball { top: 50%; width: 2.5%; aspect-ratio: 1; border-radius: 50%; background: #fff7e1; }
  p { margin: 10px 0 0; color: #cae5d8; }
</style>
<section class="game">
  <header><h2>Ping-pong</h2><output id="score" aria-label="Score">You 0 · 0 CPU</output></header>
  <div id="court" data-rivto-interactive>
    <div id="opponent" class="paddle" aria-hidden="true"></div>
    <div id="ball" aria-hidden="true"></div>
    <button id="player" class="paddle" type="button" aria-label="Your paddle" aria-describedby="status"></button>
  </div>
  <p id="status" role="status">Drag the lower paddle to serve, or use the arrow keys.</p>
</section>
<script>
(() => {
  const court = document.getElementById("court");
  const player = document.getElementById("player");
  const opponent = document.getElementById("opponent");
  const ball = document.getElementById("ball");
  const score = document.getElementById("score");
  const status = document.getElementById("status");
  // Game coordinates stay fixed as the court scales to fit the block.
  const width = 480;
  const height = 256;
  const paddleHalfWidth = 44;
  const ballRadius = 6;
  const playerSpeed = 340;
  const opponentSpeed = 195;
  let playerX = width / 2;
  let opponentX = width / 2;
  let ballX = width / 2;
  let ballY = height / 2;
  let velocityX = 95;
  let velocityY = -170;
  let targetX = playerX;
  let drag = null;
  let running = false;
  let previousTime;
  let points = 0;
  let opponentPoints = 0;
  const keys = new Set();

  /**
   * Advances one coordinate toward its target by a bounded distance.
   *
   * @param position - Current horizontal position in game units.
   * @param target - Requested horizontal position in game units.
   * @param distance - Maximum travel for the current frame in game units.
   * @returns The next coordinate, with the paddle kept inside the court.
   */
  function movePaddle(position, target, distance) {
    const next = position + Math.max(-distance, Math.min(distance, target - position));
    return Math.max(paddleHalfWidth, Math.min(width - paddleHalfWidth, next));
  }

  /**
   * Releases the current gesture and stops following its last pointer position.
   *
   * @returns The paddle stays where it reached when the pointer stopped controlling it.
   */
  function endDrag() {
    const pointerId = drag?.id;
    drag = null;
    targetX = playerX;
    if (pointerId !== undefined && player.hasPointerCapture(pointerId)) {
      player.releasePointerCapture(pointerId);
    }
  }

  /**
   * Adds a point and resets the ball for the next serve.
   *
   * @param playerWon - Whether the ball passed the top paddle.
   * @returns The updated score and serve instruction are shown.
   */
  function finishPoint(playerWon) {
    running = false;
    if (playerWon) {
      points += 1;
    } else {
      opponentPoints += 1;
    }
    score.textContent = "You " + points + " · " + opponentPoints + " CPU";
    status.textContent = playerWon ? "You scored. Drag to serve again." : "CPU scored. Drag to serve again.";
    ballX = width / 2;
    ballY = height / 2;
    keys.clear();
    endDrag();
  }

  /**
   * Moves the ball and resolves wall and paddle contacts for one frame.
   *
   * @param seconds - Bounded animation-frame elapsed time, in seconds.
   * @returns The ball has advanced, bounced, or reset after a point.
   */
  function advanceBall(seconds) {
    const oldX = ballX;
    const oldY = ballY;
    ballX += velocityX * seconds;
    ballY += velocityY * seconds;
    if (ballX < ballRadius || ballX > width - ballRadius) {
      const wall = ballX < ballRadius ? ballRadius : width - ballRadius;
      ballX = 2 * wall - ballX;
      velocityX = -velocityX;
    }
    const goingDown = velocityY > 0;
    // The two paddle faces are at y=26 and y=230 before accounting for the ball radius.
    const face = goingDown ? 230 - ballRadius : 26 + ballRadius;
    const crossedFace = goingDown ? oldY <= face && ballY >= face : oldY >= face && ballY <= face;
    if (crossedFace) {
      const paddleX = goingDown ? playerX : opponentX;
      const contactX = oldX + (ballX - oldX) * ((face - oldY) / (ballY - oldY));
      const offset = (contactX - paddleX) / (paddleHalfWidth + ballRadius);
      if (Math.abs(offset) <= 1) {
        ballY = 2 * face - ballY;
        velocityX = offset * 220;
        velocityY = -Math.sign(velocityY) * Math.min(255, Math.abs(velocityY) + 12);
      }
    }
    if (ballY < -ballRadius || ballY > height + ballRadius) {
      finishPoint(ballY < 0);
    }
  }

  /**
   * Advances the active rally and paints the resulting positions.
   *
   * @param now - Browser animation-frame timestamp in milliseconds.
   * @returns A next frame is scheduled only while the rally continues.
   */
  function tick(now) {
    const seconds = Math.min((now - (previousTime ?? now)) / 1000, 0.032);
    previousTime = now;
    const direction = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    const destination = direction ? playerX + direction * width : targetX;
    playerX = movePaddle(playerX, destination, playerSpeed * seconds);
    if (!drag) {
      targetX = playerX;
    }
    opponentX = movePaddle(opponentX, velocityY < 0 ? ballX : width / 2, opponentSpeed * seconds);
    if (seconds > 0) {
      advanceBall(seconds);
    }
    player.style.left = playerX / width * 100 + "%";
    opponent.style.left = opponentX / width * 100 + "%";
    ball.style.left = ballX / width * 100 + "%";
    ball.style.top = ballY / height * 100 + "%";
    if (running) {
      requestAnimationFrame(tick);
    }
  }

  /**
   * Launches a serve when the first drag or keyboard movement starts.
   *
   * @returns The ball is served toward the opponent, with at most one active animation loop.
   */
  function serve() {
    if (!running) {
      velocityX = (points + opponentPoints) % 2 ? -95 : 95;
      velocityY = -170;
      previousTime = undefined;
      running = true;
      status.textContent = "Rally in play";
      requestAnimationFrame(tick);
    }
  }

  player.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || drag) {
      return;
    }
    player.setPointerCapture(event.pointerId);
    keys.clear();
    drag = {
      id: event.pointerId,
      clientX: event.clientX,
      playerX,
      scale: width / court.getBoundingClientRect().width,
      moved: false,
    };
  });

  player.addEventListener("pointermove", (event) => {
    if (event.pointerId !== drag?.id) {
      return;
    }
    const delta = event.clientX - drag.clientX;
    if (!drag.moved && Math.abs(delta) < 4) {
      return;
    }
    drag.moved = true;
    targetX = drag.playerX + delta * drag.scale;
    serve();
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    player.addEventListener(type, (event) => {
      if (event.pointerId === drag?.id) {
        endDrag();
      }
    });
  }

  player.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (!drag && (running || !event.repeat)) {
        keys.add(event.key);
        serve();
      }
    }
  });
  player.addEventListener("keyup", (event) => keys.delete(event.key));
  player.addEventListener("blur", () => keys.clear());
})();
</script>`;
