node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis" ^
--dataDir "./data/dpos/miner2" ^
--loggerConsole --loggerLevel debug ^
--minerSecret c07ad83d2c5627acece18312362271e22d7aeffb6e2a6e0ffe1107371514fdc2 ^
--rpchost localhost --rpcport 18090 ^
--executor interprocess ^
--feelimit 10 ^
--netConfig ./demo/dpos/miner2.cfg %*