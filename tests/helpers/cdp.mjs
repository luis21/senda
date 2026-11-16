// Small CDP transport for testing our local browser build without dependencies.
import http from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
export async function connect(port, endpoint) {
  const key = randomBytes(16).toString('base64');
  const socket = await new Promise((resolve, reject) => {
    const req = http.request({host:'127.0.0.1',port,path:endpoint,headers:{Connection:'Upgrade',Upgrade:'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':key}});
    req.on('upgrade',(res,sock)=> {
      if (res.headers['sec-websocket-accept'] !== createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')) {
        sock.destroy(); reject(Error('Invalid WebSocket handshake')); return;
      }
      resolve(sock);
    });
    req.on('error',reject); req.end();
  });
  const pending = new Map();
  let buffer = Buffer.alloc(0), seq = 0;
  const failAll = error => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); };
  socket.on('error',failAll);
  socket.on('close',()=>failAll(Error('Browser connection closed')));
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer,chunk]);
    while(buffer.length >= 2) {
      let length=buffer[1]&127, offset=2;
      if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
      else if(length===127){if(buffer.length<10)return;length=Number(buffer.readBigUInt64BE(2));offset=10;}
      if(buffer.length<offset+length)return;
      const op=buffer[0]&15, payload=buffer.subarray(offset,offset+length);
      buffer=buffer.subarray(offset+length);
      if(op!==1)continue;
      const message=JSON.parse(payload.toString()), item=pending.get(message.id);
      if(item){clearTimeout(item.timer);pending.delete(message.id);message.error?item.reject(Error(JSON.stringify(message.error))):item.resolve(message.result);}
    }
  });
  return {
    send(method,params={},sessionId) {
      return new Promise((resolve,reject)=>{
        const id=++seq, data=Buffer.from(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
        const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method));},20000);
        pending.set(id,{resolve,reject,timer});
        const mask=randomBytes(4), header=Buffer.alloc(data.length<126?2:4);
        header[0]=129;header[1]=data.length<126?128|data.length:254;
        if(data.length>=126)header.writeUInt16BE(data.length,2);
        for(let i=0;i<data.length;i++)data[i]^=mask[i%4];
        socket.write(Buffer.concat([header,mask,data]));
      });
    },
    close(){socket.destroy();},
  };
}
