node ./dist/blockchain-sdk/src/tool/host.js create ^
--package "./dist/blockchain-sdk/demo/dpos/chain" --externalHandler ^
--dataDir "./data/dpos/genesis" ^
--loggerConsole --loggerLevel debug ^
--genesisConfig "./dist/blockchain-sdk/demo/dpos/chain/genesis.json" %*