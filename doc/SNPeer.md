SN(SuperNode)服务为BDT栈提供的通用服务，一个开启了SN服务的BDT节点可以充当SN Server的角色，一个节点可以通过SNServer的辅助，连接到另一个处在内网的BDT节点

snPeer.js为BDT提供的工具程序，用于启动一个仅有SN服务和DHT服务的BDT节点，用于提供内网穿透，也可充当节点发现的初始节点

启动snPeer的命令行如下：
```node_modules\.bin\startSN <参数名>=<参数值>```

param列表如下：
参数名|类型|默认值|是否必须|说明
------|---|------|-------|----
peerid|string|无|是|该节点的peerid，BDT网络中用Peerid区分不同节点，同网络中不同节点的Peerid一定不能相同
tcpPort|number|无|是|该节点监听的tcp端口值
udpPort|number|无|是|该节点监听的udp端口值
log_level|string|"all"|否|可选输入值 [all, trace, debug, info, warn, error, off]，表示日志级别，日志只会打印到文件
log_file_dir|string|".\log"|否|指定日志文件的存储路径
log_file_name|stirng|"bdt"|否，指定日志文件的baseName，日志文件会以16M分割成多文件来滚动存储

推荐使用pm2等进程管理工具启动SNPeer，以便出错重启。SNPeer如果下线，会对它所在的P2P网络产生整体影响！！

SNPeer的使用：
>从host.js启动miner或peer时，添加以下参数即可：<br/>
```--sn SNPeerID@SN外网IP@TCP端口@UDP端口```

>假设服务器外网地址为12.34.56.78，给SNPeer配置端口为tcp 10000, udp 10001; 启动SNPeer的命令行为<br/>
```node_modules\.bin\startSN peerid=SN_PEER_TEST out_host=12.34.56.78 tcpPort=10000 udpPort=10001```

>启动miner或peer的参数为<br/>
>```--sn SN_PEER_TEST@12.34.56.78@10000@10001```
