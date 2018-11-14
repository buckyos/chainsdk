node ./dist/blockchain-sdk/src/tool/host.js create ^
--package "./dist/blockchain-sdk/demo/coin2/chain" --externalHandler ^
--dataDir "./data/coin2/genesis" ^
--loggerConsole --loggerLevel debug ^
--genesisConfig "./dist/blockchain-sdk/demo/coin2/chain/genesis.json" %*