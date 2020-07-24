// liveGame.jsx
//
// Higher order components really do work, albeit somewhat messily.
// I still think inheritance (class LiveGame extends Game) would be slightly cleaner.

function LiveGameDisplay(props) {
	// get the state object of the game
	const state = props.reactState;
	
	const clocks = state.clocks; // somehow get these
	let clockElements = [];
	if (clocks) {
		for (let i = 0; i < clocks.length; i++) {
			const clock = clocks[i];
			let className = "clock text-md-right card";
			if (clock.running) {
				className += " bg-primary text-light";
			}
			
			// Work out how much time is really left.
			/*
			Clock is {
				username: username,
				running: Boolean,
				timeLeft: seconds,
				delayLeft: seconds,
				type: "delay" or "increment",
				bonus: seconds,
			};
			These values all reflect what was on the clock WHEN IT WAS SENT.
			*/
			
			// How much time has passed since you started?
			const timeElapsed = (Date.now() - state.clocksReceived) / 1000;
			if (timeElapsed < 0) {
				console.warn("Oh no! There has been a temporal distortion!", state.clocksReceived, timeElapsed);
			}
			let timeLeft = clock.timeLeft;
			if (clock.running) {
				// so here some time has passed...
				if (timeElapsed > clock.delayLeft) {
					// delay time is expired
					// remove however much time has passed exceeding the delay
					timeLeft -= (timeElapsed - clock.delayLeft);
				}
			}
			
			// Absolute value, to avoid weird renders like -1:0-2
			const min = Math.floor(Math.abs(timeLeft) / 60);
			// floor both, so it is an integer
			const sec = Math.floor(Math.abs(timeLeft) % 60);
			
			const timeDisplay = (timeLeft < 0 ? "-" : "") + min + ":" + (sec < 10 ? "0" : "") + sec;
			
			let usernameClassName = "card-title clock-name";
			if (clock.username.length > 15) {
				usernameClassName += " h6"; // make it small to fit
			} else if (clock.username.length > 6) {
				usernameClassName += " h5";
			} else {
				usernameClassName += " h4"; // more room = bigger
			}
			
			clockElements.push(
				<div key={clock.username} className={className}>
					<div className="card-body">
						<h5 className="card-title clock-name">{clock.username}</h5>
						<h4 className="clock-value">{timeDisplay}</h4>
					</div>
				</div>
			);
		}
	} else {
		// still show the player turn order
		const current = props.gameState;
		const players = current.turnOrder;
		for (let i = 0; i < players.length; i++) {
			let className = "clock";
			if (players[i] === current.turn) {
				className += " active";
			}
			clockElements.push(<div key={players[i]} className={className}>
				<div className="card-body">
					<h5 className="card-title clock-name">{players[i]}</h5>
				</div>
			</div>)
		}
		clockElements.push()
	}
	
	return <div className="row">
		<div className="col-12 col-lg-10">{props.children}</div>
		{/*
		basically:
		on small screens, clocks are positioned below the board and flex horizontally
		on large screens, clocks are positioned to the right and flex vertically
		*/}
		<div className="col-12 col-lg-2 d-flex flex-row flex-lg-column justify-content-around justify-content-lg-start">{clockElements}</div>
	</div>
}

// wrapper component, events, additional state
const LiveGame = withGame(LiveGameDisplay, {
	// These methods will be run on the wrapped component
	onMount: function() {
		socket.on("gamePosition", function(data) {
			// data contains the game and the viewer
			const game = data.game;
			const isYourTurn = (game.currentState.turn === YOUR_USERNAME);
			const isHomeworldSetup = (game.currentState.phase === "setup");
			this.setState({
				// we want a GameState object, not a vanilla object
				current: GameState.recoverFromJSON(game.currentState),
				history: data.history,
				// Start homeworld setup if and only if it is your turn
				actionInProgress: (isYourTurn && isHomeworldSetup) ? {type: "homeworld"} : null,
				viewer: data.viewer,
				
				actionsThisTurn: data.actionsThisTurn,
				turnResets: data.turnResets,
				
				// clock functionality requires knowing when the clocks were received
				clocks: game.clocks,
				clocksReceived: Date.now(),
			});
		}.bind(this));
		
		// race conditions are going to seriously mess this up...
		
		// Largely the same logic is used for action and endTurn.
		// The only difference is that endTurn also calls doEndTurn.
		const resolveActions = function(data) {
			try {
				// Which turn attempt is this?
				const theirResets = data.turnResets;
				const ourResets = this.state.turnResets;
				const theirActions = data.actionsThisTurn;
				if (theirResets > ourResets) {
					console.log("Oops, we need to reset!");
					// this is on a new iteration of the turn
					// reset and try again
					this.doResetTurn(data.player);
					// then do all their actions
					for (var i = 0; i < theirActions.length; i++) {
						this.doAction(theirActions[i], data.player);
					}
				} else if (theirResets === ourResets) {
					// this is on the same turn
					// do any actions above and beyond what we recorded
					const ourActions = this.state.actionsThisTurn;
					// NOTE: Possible bug here if theirActions and ourActions do not line up
					// but that shouldn't happen!
					
					console.log("They have done", theirActions.length, "actions and we have registered", ourActions.length);
					// e.g. we have 2 actions and they send 5: loop from [2] to [4]
					for (let i = ourActions.length; i < theirActions.length; i++) {
						console.log("Doing action", theirActions[i]);
						this.doAction(theirActions[i], data.player);
					}
					
					// Update our action list to match theirs.
					if (ourActions.length < theirActions.length) {
						this.setState({
							actionsThisTurn: theirActions,
						});
					}
				}
				// else, this message came from an outdated turn
				// do nothing
			} catch (error) {
				// Uh oh, this is really bad. We are out of sync.
				// Ask for the game state again.
				console.error("\n\n\n\n[resolveActions] SYNC ERROR!!\n\n");
				console.error(error);
				console.log("\n\n\n");
				socket.emit("getGame", GAME_ID);
			}
		}.bind(this);
		// Actions are easy
		socket.on("action", resolveActions);
		// Turn ending is more involved
		socket.on("endTurn", function(data) {
			resolveActions(data);
			try {
				this.doEndTurn(data.player);
				this.setState({
					turnResets: 0,
					actionsThisTurn: [],
				})
			} catch (error) {
				console.error("\n\n\n\n[endTurn] SYNC ERROR!!\n\n");
				console.error(error);
				console.log("\n\n\n");
				socket.emit("getGame", GAME_ID);
			}
		}.bind(this));
		// Turn resetting is less involved
		socket.on("resetTurn", function(data) {
			// this is very simple
			console.warn("They Reset the Turn");
			console.log(data);
			console.log(this.state.turnResets);
			if (data.turnResets > this.state.turnResets) {
				this.doResetTurn(data.player);
				this.setState({
					turnResets: data.turnResets,
					actionsThisTurn: [],
				});
			}
		}.bind(this));
		
		// whenever you receive clock data
		socket.on("clockUpdate", function(data) {
			// data.clocks is currently the only thing it sends
			if (data.clocks) {
				this.setState({
					clocks: data.clocks,
					clocksReceived: Date.now(),
				});
			}
		}.bind(this));
		
		// TODO: Better way to handle the timers
		setInterval(this.forceUpdate.bind(this), 250);
	},
	
	// this one just generically asks if you can do anything at all
	canInteract: function(state) {
		return state.turn === YOUR_USERNAME;
	},
	// I have to be a little bit careful here
	// we call doAction when the other player moves, too
	onBeforeAction: function(action, player, oldState, newState) {
		// hmmm... do we even need anything else?
		return true;
	},
	onAfterAction: function(action, player, newState) {
		console.warn("onAfterAction", player);
		if (player === YOUR_USERNAME) {
			// the action is yours
			console.log("emitting");
			// Append the newest action to your actions taken this turn
			const actionsThisTurn = this.state.actionsThisTurn.concat([action]);
			socket.emit("doAction", {
				action: action,
				gameID: GAME_ID,
				// Race Condition Defenses, Inc.
				actionsThisTurn: actionsThisTurn,
				turnResets: this.state.turnResets,
			});
			this.setState({
				actionsThisTurn: actionsThisTurn,
			});
		}
	},
	onAfterEndTurn: function(player, newState) {
		console.warn("onAfterEndTurn", arguments);
		if (player === YOUR_USERNAME) {
			console.log("emitting");
			socket.emit("doEndTurn", {
				gameID: GAME_ID,
				// make sure we end the correct version of your turn
				actionsThisTurn: this.state.actionsThisTurn,
				turnResets: this.state.turnResets,
			});
		}
		
		// All end turns reset the action counters
		this.setState({
			actionsThisTurn: [],
			turnResets: 0,
		});
	},
	onAfterResetTurn: function(player, newState) {
		console.warn("onAfterResetTurn", arguments);
		if (player === YOUR_USERNAME) {
			console.log("emitting");
			// Simple countermeasure to ensure an old turn reset does not surface later
			const turnResets = this.state.turnResets + 1;
			socket.emit("doResetTurn", {
				gameID: GAME_ID,
				turnResets: turnResets,
			});
			// update the state
			this.setState({
				turnResets: turnResets,
				actionsThisTurn: [],
			});
		}
	},
}, {
	viewer: YOUR_USERNAME,
	clocks: [],
	clocksReceived: Date.now(),
	pingMS: 0,
	
	// for race condition avoidance
	actionsThisTurn: [],
	turnResets: 0,
});

ReactDOM.render(<LiveGame />, document.getElementById("game-container"));