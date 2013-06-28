(function (context) {

  /*********************************************************************
  *  Game - This is the public API
  *
  *  **Usage**
  *
  *      // Calling without arguments will generate an
  *      // 8x8 board with 10 mines
  *      var game = new Game({
  *        dimension : "8x8",
  *        mines : 10
  *      });
  *
  *********************************************************************/

  var Game = function (settings) {
    new Minesweeper(settings);
  };

  // Expose game to the context
  context.Game = Game;

  /*********************************************************************
  *  Minesweeper
  *********************************************************************/

  var Minesweeper = function (settings) {
    this.element = $("#minesweeper");
    this.placeholder = this.element.find(".board-placeholder");
    this.settings = $.extend({}, Minesweeper.defaultSettings, settings);
    this.controls = new Controls(this.element.find(".controls"), this);

    this.start(this.settings);
  };

  // Default settings, may be overriden
  Minesweeper.defaultSettings = {
    dimension : "8x8",
    mines : 10
  };

  // Cheat pattern
  Minesweeper.cheat = "38.38.40.40.37.39.37.39.66.65.13".split(".");

  // Shortcut to prototype
  Minesweeper.fn = Minesweeper.prototype;

  // Public methods
  // --------------

  // Starts a new game by creating a new board
  Minesweeper.fn.start = function (settings) {
    // Stores the tiles which have a mine
    this._mines = [];

    // Stores which tiles have been revealed
    this._revealed = [];

    this._monitoredKeys = [];

    this._exitCheatMode();
    this._createBoard(settings);

    this.controls.reset();

    this._attachEvents();
  };

  // Reveals a tile, and recursevely reveals the surrounding ones
  // when necessary
  Minesweeper.fn.revealTile = function (tile) {
    var surroundingTiles = this._getSurroundingTiles(tile)
      , tileContent = tile.reveal()
    ;

    this._revealed.push(tile);

    // Either mine or close to mine
    if (tileContent !== 0) {
      return tileContent;
    }

    // Free tile, let's recursively reveal the neighbours
    for (var i = 0, l = surroundingTiles.length; i < l; i++) {
      // No need to reveal already revealed tiles
      if (!surroundingTiles[i].hasBeenRevealed) {
        this.revealTile(surroundingTiles[i]);
      }
    }
  };

  // Checks if the user has won the game
  Minesweeper.fn.checkStatus = function () {
    var totalTiles = this.dimension.rows * this.dimension.columns;

    // Number of revealed tiles + mines = total tiles. WIN!
    if (this._revealed.length + this._mines.length === totalTiles) {
      this.setStatus("victory");
      return true;
    }

    this.setStatus("gameover", "validation");
  };

  // Sets the game status
  Minesweeper.fn.setStatus = function (status, reason) {
    this._lockBoard();
    this.controls.hideValidateButton();
    this._exitCheatMode();

    if (status === "victory") {
      this._revealMines({ noexplosion : true });
      this.controls.setMessage("Victory! =)", "positive");
      return true;
    }

    this._revealMines();

    if (reason === "mine") {
      this.controls.setMessage("Game over:<br />You have been blown =(", "negative");
    }

    if (reason === "validation") {
      this.controls.setMessage("Game over:<br />You missed some tiles =(", "negative");
    }
  };

  // Private methods
  // ---------------

  // Creates a new board with a given dimension and number of mines
  Minesweeper.fn._createBoard = function (settings) {
    var dimension = settings.dimension.split("x")
      , rows
      , columns
    ;

    if (dimension.length !== 2) { throw "Wrong dimension format"; }

    rows = parseInt(dimension[0], 10);
    columns = parseInt(dimension[1], 10);

    if (settings.mines >= rows * columns) { throw "The board should have at least one free tile"; }

    this.boardView = $("<div />", { "class" : "board" });

    this.dimension = {
      rows : rows,
      columns : columns
    };

    this._buildBoard(rows, columns);
    this._distributeMines(settings.mines);

    this.placeholder.html(this.boardView);

    this.boardView.width(columns * $(".tile").first().outerWidth());
  };

  // Reveals all mines
  Minesweeper.fn._revealMines = function (opts) {
    for (var i = 0, l = this._mines.length; i < l; i++) {
      this._mines[i].reveal(opts);
    }
  };

  // Gets the surrounding tiles around a given tile
  Minesweeper.fn._getSurroundingTiles = function (tile) {
    var tileRow = tile.position.row
      , tileColumn = tile.position.column
      , minRow = Math.max(tileRow - 1, 0)
      , minColumn = Math.max(tileColumn - 1, 0)
      , maxRow = Math.min(tileRow + 1, this.dimension.rows - 1)
      , maxColumn = Math.min(tileColumn + 1, this.dimension.columns - 1)
      , tiles = []
    ;

    for (var i = minRow; i <= maxRow; i++) {
      for (var j = minColumn; j <= maxColumn; j++) {
        // exclude the tile itself
        if (i !== tileRow || j !== tileColumn) {
          tiles.push(this.board[i][j]);
        }
      }
    }

    return tiles;
  };

  // Builds the board matrix
  Minesweeper.fn._buildBoard = function (rows, columns) {
    this.board = [];

    for (var i = 0; i < rows; i++) {
      this.board[i] = [];

      for (var j = 0; j < columns; j++) {
        this.board[i].push(new Tile(this.boardView, {
          row : i,
          column : j
        }));
      }
    }
  };

  // Randomly distributes the n mines across the board
  Minesweeper.fn._distributeMines = function (mines) {
    // Temporarily flatten the board for a random distribution
    var flattenedBoard = utils.flattenMatrix(this.board)
      , randomPosition
    ;

    for (var i = 0; i < mines; i++) {
      // Math.floor does not generate a uniform distribution,
      // but is as close as we can get for now
      randomPosition = Math.floor(Math.random() * (flattenedBoard.length - 1));

      // Insert the mine into a random tile
      flattenedBoard[randomPosition].insertMine(this._getSurroundingTiles(flattenedBoard[randomPosition]));

      // Store into the array of tiles with mines
      this._mines.push(flattenedBoard[randomPosition]);

      // Remove this tile from the next random insertion
      flattenedBoard.splice(randomPosition, 1);
    }
  };

  // Prevents any interaction with the board. The only way to unlock
  // the board is by starting a new game.
  Minesweeper.fn._lockBoard = function () {
    this.boardView
      .off("click")
      .addClass("locked")
    ;
  };

  // Enters in cheat mode
  Minesweeper.fn._enterCheatMode = function () {
    for (var i = 0, l = this._mines.length; i < l; i++) {
      this._mines[i].view.addClass("cheat");
    }
  };

  // Exists the cheat mode
  Minesweeper.fn._exitCheatMode = function () {
    this.element.find(".tile").removeClass("cheat");
  };

  // Attaches callbacks to DOM events
  Minesweeper.fn._attachEvents = function () {
    this.boardView.off("click.minesweeper").on("click.minesweeper", ".tile", this._onTileClick.bind(this));
    $(context).off("keyup.minesweeper").on("keyup.minesweeper", this._onKeyup.bind(this));
  };

  // Callbacks
  // ---------

  // Callback called when a tile is clicked on the board
  Minesweeper.fn._onTileClick = function (event) {
    var tileView = $(event.target)
      , row = tileView.data("row")
      , column = tileView.data("column")
      , tile = this.board[row][column]
    ;

    // If tile has already been revelaed, do nothing
    if (tile.hasBeenRevealed) {
      return true;
    }

    if (this.revealTile(tile) === "mine") {
      this.setStatus("gameover", "mine");
      return true;
    }
  };

  // Monitors the keyup for the cheat code
  Minesweeper.fn._onKeyup = function (event) {
    var key = event.which
      , length
    ;

    this._monitoredKeys.push(key);

    length = this._monitoredKeys.length;

    // Key is not correct, reset monitoring
    if (this._monitoredKeys[length - 1] !== parseInt(Minesweeper.cheat[length - 1], 10)) {
      this._monitoredKeys = [];
      return true;
    }

    // Code complete!
    if (Minesweeper.cheat.length === length) {
      this._monitoredKeys = [];
      this._enterCheatMode();
    }
  };

  /*********************************************************************
  *  Tile
  *********************************************************************/

  var Tile = function (boardView, position) {
    this.position = position;
    this.neighbourMines = 0;
    this.hasBeenRevealed = false;

    this.appendToBoard(boardView);
  };

  // Shortcut to prototype
  Tile.fn = Tile.prototype;

  // Public methods
  // --------------

  // Appends the tile to the board
  Tile.fn.appendToBoard = function (boardView) {
    var className = "tile";

    if (this.position.column === 0) {
      className += " first-column";
    }

    this.view = $("<div />", { "class" : className });

    this.view
      .data("row", this.position.row)
      .data("column", this.position.column)
    ;

    boardView.append(this.view);
  };

  // Inserts a mine into the tile
  Tile.fn.insertMine = function (surroundingTiles) {
    this.hasMine = true;
    this.neighbourMines = 0;

    // Notifies the neighbours that they have a mine nearby
    for (var i = 0, l = surroundingTiles.length; i < l; i++) {
      // Mines do not carry neighbour mines info
      if (!surroundingTiles[i].hasMine) {
        surroundingTiles[i].increaseNeighbourMinesCount();
      }
    }
  };

  // Increase the neighbour mines count
  Tile.fn.increaseNeighbourMinesCount = function () {
    this.neighbourMines++;
  };

  // Reveals the tile's content
  Tile.fn.reveal = function (opts) {
    this.hasBeenRevealed = true;

    if (this.hasMine) {
      if (opts && opts.noexplosion) {
        this.view.addClass("found");
      } else {
        this.view.addClass("exploded");
      }
      return "mine";
    }

    this.view.addClass("revealed");

    if (this.neighbourMines !== 0) {
      this.view
        .addClass("qty-" + this.neighbourMines)
        .text(this.neighbourMines)
      ;
    }

    return this.neighbourMines;
  };

  /*********************************************************************
  *  Controls
  *********************************************************************/

  var Controls = function (element, game) {
    this.element = element;
    this.game = game;

    this._attachEvents();
  };

  // Maps a difficulty to a ratio of mines per board size
  // Easy   - 5 mines in 64 spaces
  // Medium - 10 mines in 64 spaces
  // Hard   - 20 mines in 64 spaces
  // Insane - 30 mines in 64 spaces
  Controls.difficultyMap = {
    "easy"   : 0.078125,
    "medium" : 0.15625,
    "hard"   : 0.3125,
    "insane" : 0.46875
  };

  // Shortcut to prototype
  Controls.fn = Controls.prototype;

  // Public methods
  // --------------

  // Displays the message of a given type
  Controls.fn.setMessage = function (message, type) {
    this.element.find(".message").html(message).addClass(type);
  };

  // Resets the controls UI
  Controls.fn.reset = function () {
    this.element.find(".message").html("").removeClass("positive negative");
    this.element.find(".validate-board").show();
  };

  // Hides the validation button
  Controls.fn.hideValidateButton = function () {
    this.element.find(".validate-board").hide();
  };

  // Private methods
  // ---------------

  // Attaches callbacks to DOM events
  Controls.fn._attachEvents = function () {
    this.element.find(".create-board").on("click", this._onCreateBoardClick.bind(this));
    this.element.find(".validate-board").on("click", this._onValidateBoardClick.bind(this));
  };

  // Callbacks
  // ---------

  // Called when the New game button is clicked
  Controls.fn._onCreateBoardClick = function (event) {
    var rows = parseInt(this.element.find("#new-game-rows").val(), 10)
      , columns = parseInt(this.element.find("#new-game-columns").val(), 10)
      , difficulty = this.element.find("#new-game-level").val()
      , mines
    ;

    if (isNaN(rows) || isNaN(columns)) {
      alert("Invalid board properties");
      return true;
    }

    mines = Math.floor(Controls.difficultyMap[difficulty] * rows * columns);

    this.game.start({
      dimension : rows + "x" + columns,
      mines : mines
    });
  };

  // Called when the validation button is clicked
  Controls.fn._onValidateBoardClick = function (event) {
    this.game.checkStatus();
  };

  /*********************************************************************
  *  Utilities
  *********************************************************************/

  var utils = {

    // Flattens multi-array into a single array
    flattenMatrix : function (matrix) {
      var flattened = [];

      for (var i = 0, l = matrix.length; i < l; i++) {
        flattened = flattened.concat(matrix[i]);
      }

      return flattened;
    }

  };

})(window);
