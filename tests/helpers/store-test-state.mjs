export async function setTrackedExtension(changed,id,enabled,mutate,confirm){
  if(!enabled)changed.add(id);
  await mutate();
  await confirm();
  if(enabled)changed.delete(id);
}

export async function restoreTestState(stop,restoreException){
  const errors=[];
  try{await stop()}catch(error){errors.push(error)}
  try{await restoreException()}catch(error){errors.push(error)}
  return errors;
}
