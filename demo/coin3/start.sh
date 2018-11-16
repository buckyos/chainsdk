#!/bin/sh

node ./dist/blockchain-sdk/src/tool/host.js create --package "./dist/blockchain-sdk/demo/coin3/chain" --externalHandler --dataDir "./data/coin3/genesis" --loggerConsole --loggerLevel debug --genesisConfig "./dist/blockchain-sdk/demo/coin3/chain/genesis.json"
wait
echo 'run miner1'
nohup node ./dist/blockchain-sdk/src/tool/host.js miner --genesis "./data/coin3/genesis" --dataDir "./data/coin3/miner1" --minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 --net bdt --host 127.0.0.1 --port "12312" --peerid 13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ --sn SN_PEER_DBFT@106.75.173.166@12405@12406 --bdt_log_level info --rpchost localhost --rpcport 18089 --loggerConsole --loggerLevel debug --feelimit 10 $* > console1.log &

nohup node ./dist/blockchain-sdk/src/tool/host.js miner --genesis "./data/coin3/genesis" --dataDir "./data/coin3/miner2" --minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 --net bdt --host 127.0.0.1 --port "12313" --peerid 12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ --sn SN_PEER_DBFT@106.75.173.166@12405@12406 --bdt_log_level info --rpcport 18089 --loggerConsole --loggerLevel debug --feelimit 10 $* > console2.log &