var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("GameLobby error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("GameLobby error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("GameLobby contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of GameLobby: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to GameLobby.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: GameLobby not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "openLobby",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "availablePlayer",
            "type": "address"
          }
        ],
        "name": "signup",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "winner",
            "type": "address"
          }
        ],
        "name": "gameEnded",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "closeLobby",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "name": "leaderboard",
        "outputs": [
          {
            "name": "",
            "type": "int256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "player1",
            "type": "address"
          },
          {
            "name": "player2",
            "type": "address"
          }
        ],
        "name": "startGame",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "inputs": [],
        "type": "constructor"
      },
      {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "game",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "player1",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "player2",
            "type": "address"
          }
        ],
        "name": "GameCreated",
        "type": "event"
      }
    ],
    "unlinked_binary": "0x6060604052600080546c0100000000000000000000000033810204600160a060020a03199091161790556002805460ff19169055610aa6806100416000396000f3606060405236156100565760e060020a60003504630b645148811461005b578063316df4b51461008a578063402f6e5d146100e257806359294c8314610156578063d1d33d2014610181578063eb23b56b1461019e575b610002565b346100025761023460005433600160a060020a0390811691161415610088576002805460ff191660011790555b565b346100025761023460043560025460ff1615156001141561028657600180548082018083558281838015829011610248576000838152602090206102489181019083015b8082111561028957600081556001016100ce565b346100025761023460043560005b60035481101561028d5733600160a060020a0316600360005082815481101561000257600091825260209091200154600160a060020a0316141561014e57600160a060020a0382166000908152600460205260409020805460010190555b6001016100f0565b346100025761023460005433600160a060020a0390811691161415610088576002805460ff19169055565b346100025761023660043560046020526000908152604090205481565b346100025761023460043560243560025460009060ff1615156001141561031e578282604051610783806103238339018083600160a060020a0316815260200182600160a060020a0316815260200192505050604051809103906000f0801561000257905060036000508054806001018281815481835581811511610291576000838152602090206102919181019083016100ce565b005b60408051918252519081900360200190f35b505050600092835250602090912001805473ffffffffffffffffffffffffffffffffffffffff19166c01000000000000000000000000838102041790555b50565b5090565b5050565b50505060009283525060209182902001805473ffffffffffffffffffffffffffffffffffffffff19166c010000000000000000000000008481020417905560408051600160a060020a0380851682528681169382019390935291841682820152517fd3432ff5c78a4cfac45492c26900080695bc03e553bf581d99afdee4869c3e71916060908290030190a15b505050566060604081815280610783833960a09052516080516003805460a060020a61ffff02196c01000000000000000000000000338102819004600160a060020a031993841617919091169092556000805485840284900490831617905560018054848402939093049290911691909117905550506107048061007f6000396000f36060604052361561006c5760e060020a600035046314034bd28114610071578063563c4d28146100e257806359a5f12d146101845780636160e2641461019b5780638e6afff9146101b4578063b85508bc146101e9578063d30895e414610202578063dfbf53ae14610219575b610002565b34610002576102305b6003546000908190819060a060020a810460ff90811660a860020a909204161415610279576004805460018101808355828183801582901161030c5760008381526020902061030c9181019083015b8082111561037857805461ffff191681556001016100c9565b3461000257610230600435600054600254600160a060020a0390811691161480159061011f5750600154600254600160a060020a03908116911614155b156107015760005433600160a060020a03908116911614801561014c575060035460a060020a900460ff16155b15610671576003805474ff0000000000000000000000000000000000000000191660a060020a60f860020a84810204021790556106ce565b3461000257610232600154600160a060020a031681565b346100025761024e60035460ff60a860020a9091041681565b34610002576102606004356004805482908110156100025760009182526020909120015460ff80821692506101009091041682565b346100025761024e60035460ff60a060020a9091041681565b3461000257610232600054600160a060020a031681565b3461000257610232600254600160a060020a031681565b005b60408051600160a060020a039092168252519081900360200190f35b60408051918252519081900360200190f35b6040805192835260208301919091528051918290030190f35b60035460ff60a060020a9091041660011480156102b8575060035460ff60a860020a90910416600414806102b857506003805460a860020a900460ff16145b1561042157505060005460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460015460a060020a820460ff908116945060a860020a90920490911691166103c7565b505050919090600052602060002090016000506040805180820190915260035460ff60a060020a8204811680845260a860020a909204166020909201829052825460f860020a9283028390046101000261ff00199284029390930460ff1990911617161790555061041c565b5090565b505060015460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460005460a860020a820460ff908116945060a060020a90920490911691165b60025460408051600160a060020a039283168152918316602083015281810185905260608201849052517fd346de7f3a10e87dac0a82c33d50cd605f49f9cd3ec853806c16d65dfc839e089181900360800190a15b505050565b60035460ff60a060020a909104166002148015610462575060035460ff60a860020a9091041660011480610462575060035460ff60a860020a909104166005145b156104b657505060005460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460015460a060020a820460ff908116945060a860020a90920490911691166103c7565b6003805460a060020a900460ff161480156104f5575060035460ff60a860020a90910416600214806104f5575060035460ff60a860020a909104166004145b1561054957505060005460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460015460a060020a820460ff908116945060a860020a90920490911691166103c7565b60035460ff60a060020a90910416600414801561058a575060035460ff60a860020a909104166005148061058a575060035460ff60a860020a909104166002145b156105de57505060005460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460015460a060020a820460ff908116945060a860020a90920490911691166103c7565b60035460ff60a060020a90910416600514801561061d57506003805460a860020a900460ff16148061061d575060035460ff60a860020a909104166001145b1561037c57505060005460028054600160a060020a031916606060020a600160a060020a0393841681020417905560035460015460a060020a820460ff908116945060a860020a90920490911691166103c7565b60015433600160a060020a039081169116148015610699575060035460a860020a900460ff16155b156106ce576003805475ff000000000000000000000000000000000000000000191660a860020a60f860020a84810204021790555b60035460a060020a900460ff16158015906106f4575060035460a860020a900460ff1615155b156107015761070161007a565b5056",
    "events": {
      "0xd3432ff5c78a4cfac45492c26900080695bc03e553bf581d99afdee4869c3e71": {
        "anonymous": false,
        "inputs": [
          {
            "indexed": false,
            "name": "game",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "player1",
            "type": "address"
          },
          {
            "indexed": false,
            "name": "player2",
            "type": "address"
          }
        ],
        "name": "GameCreated",
        "type": "event"
      }
    },
    "updated_at": 1480263641187
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "GameLobby";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.GameLobby = Contract;
  }
})();
