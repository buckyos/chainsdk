node ./dist/blockchain-sdk/src/tool/host.js create \
--package "./dist/blockchain-sdk/demo/coin3/chain" --externalHandler \
--dataDir "./data/coin3/genesis" \
--loggerConsole --loggerLevel debug \
--genesisConfig "./dist/blockchain-sdk/demo/coin3/chain/genesis.json" 