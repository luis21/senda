import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {connect} from './helpers/cdp.mjs';

test('decodes a 127-byte response without confusing frame-length encodings', async () => {
  const server=http.createServer();
  const peers=new Set();
  server.on('upgrade',(req,socket)=>{
    peers.add(socket);
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    socket.once('data',()=>{
      const body=Buffer.from(JSON.stringify({id:1,result:{value:'a'.repeat(97)}}));
      assert.equal(body.length,127);
      socket.write(Buffer.concat([Buffer.from([0x81,0x7e,0x00,0x7f]),body]));
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let client, timeout;
  try {
    client=await connect(server.address().port,'/');
    const result=await Promise.race([client.send('Test.frame'),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('127-byte response was not decoded')),1000);})]);
    assert.equal(result.value,'a'.repeat(97));
  } finally {
    clearTimeout(timeout);client?.close();for(const socket of peers)socket.destroy();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('watches bounded protocol events for one session and releases stopped watches',async()=>{
  const server=http.createServer(),peers=new Set();
  server.on('upgrade',(req,socket)=>{
    peers.add(socket);
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    socket.once('data',()=>{
      const send=value=>{const body=Buffer.from(JSON.stringify(value));assert.ok(body.length<126);socket.write(Buffer.concat([Buffer.from([0x81,body.length]),body]));};
      send({method:'Changed',sessionId:'other',params:{value:-1}});
      for(let value=0;value<205;value++)send({method:'Changed',sessionId:'match',params:{value}});
      send({method:'Other',sessionId:'match',params:{value:42}});
      send({id:1,result:{}});
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let client;
  try{
    client=await connect(server.address().port,'/');
    const watch=client.watch('Changed','match'),other=client.watch('Other','match'),stopped=client.watch('Changed','match');stopped.stop();
    await client.send('Test.events');
    assert.equal(watch.events.length,200);assert.equal(watch.events[0].value,5);assert.equal(watch.events.at(-1).value,204);
    assert.deepEqual(other.events,[{value:42}]);assert.equal(stopped.events.length,0);
  }finally{client?.close();for(const socket of peers)socket.destroy();await new Promise(resolve=>server.close(resolve));}
});
