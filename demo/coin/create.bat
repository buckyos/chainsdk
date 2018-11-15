node ./dist/blockchain-sdk/src/tool/host.js create ^
--package "./dist/blockchain-sdk/demo/coin/chain" --externalHandler ^
--dataDir "./data/coin/genesis" ^
--loggerConsole --loggerLevel debug ^
--genesisConfig "./dist/blockchain-sdk/demo/coin/chain/genesis.json" %*