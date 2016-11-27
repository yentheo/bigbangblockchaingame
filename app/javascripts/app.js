var accounts;
var account;

function setStatus(message) {
  var status = document.getElementById("status");
  status.innerHTML = message;
};

function refreshBalance() {
  var meta = MetaCoin.deployed();

  meta.getBalance.call(account, {from: account}).then(function(value) {
  console.log(value);
  }).catch(function(e) {
    console.log(e);
    setStatus("Error getting balance; see log.");
  });
};

function sendCoin() {
  var meta = MetaCoin.deployed();

  var amount = parseInt(document.getElementById("amount").value);
  var receiver = document.getElementById("receiver").value;

  setStatus("Initiating transaction... (please wait)");

  meta.sendCoin(receiver, amount, {from: account}).then(function() {
    setStatus("Transaction complete!");
    refreshBalance();
  }).catch(function(e) {
    console.log(e);
    setStatus("Error sending coin; see log.");
  });
};

window.onload = function() {
  
  web3.eth.getAccounts(function(err, accs) {
    if (err != null) {
      alert("There was an error fetching your accounts.");
      return;
    }

    if (accs.length == 0) {
      alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
      return;
    }

    accounts = accs;
    console.log(accounts);
    let account0 = accounts[0];
    let account1 = accounts[1];
  
    GameLobby.new({from: account0, gas:4700000})
    .then(function(instance) {
      console.log('lobby available at :' + instance.address);
      var lobby = GameLobby.at(instance.address);
      return lobby.openLobby({from: account0})})
    .then(function(tx_id){
        console.log('open for business');
        lobby.signup(account0);
        return lobby.signup(account1)})
    .then(function(tx_id){
    var gameStarted = lobby.GameCreated(function(error, result){
        if (!error)
          console.log(result);
        });
      return  lobby.startGame(account0, account1).
    })
    .then(function(tx_id){
          console.log('game created');
        })
    .catch(function(e) {
      console.log(e);  
  });
})};
