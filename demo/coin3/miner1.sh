nohup node ./dist/blockchain-sdk/src/tool/host.js miner \
--genesis "./data/coin3/genesis" \
--dataDir "./data/coin3/miner1" \
--minerSecret e109b61f011c9939ac51808fac542b66fcb358f69bf710f5d11eb5d1f3e82bc3 \
--net bdt --host 127.0.0.1 --port "12312" --peerid 13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ --sn SN_PEER_DBFT@127.0.0.1@12405@12406 --bdt_log_level info \
--rpchost localhost --rpcport 18089 \
--loggerConsole --loggerLevel debug \
--feelimit 10 $* > console1.log &