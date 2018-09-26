node ./dist/blockchain-sdk/src/tool/host.js create ^
--package "./dist/blockchain-sdk/demo/dbft/chain" --externalHandler ^
--dataDir "./data/dbft/genesis" ^
--loggerConsole --loggerLevel debug ^
--genesisConfig "./dist/blockchain-sdk/demo/dbft/chain/genesis.json" ^
--forceClean