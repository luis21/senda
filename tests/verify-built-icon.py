"""Read Windows resources as data; never execute the target browser."""
import ctypes
import struct
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
exe=Path(sys.argv[1]) if len(sys.argv)>1 else root/'.chromium/src/out/SendaDev/chrome.exe'
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.LoadLibraryExW.argtypes=[ctypes.c_wchar_p,ctypes.c_void_p,ctypes.c_uint32]
kernel.LoadLibraryExW.restype=ctypes.c_void_p
kernel.FindResourceW.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p]
kernel.FindResourceW.restype=ctypes.c_void_p
kernel.SizeofResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
kernel.SizeofResource.restype=ctypes.c_uint32
kernel.LoadResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
kernel.LoadResource.restype=ctypes.c_void_p
kernel.LockResource.argtypes=[ctypes.c_void_p]
kernel.LockResource.restype=ctypes.c_void_p
kernel.FreeLibrary.argtypes=[ctypes.c_void_p]
module=kernel.LoadLibraryExW(str(exe.resolve()),None,0x2|0x20)
assert module,ctypes.WinError(ctypes.get_last_error())
def resource(name,kind):
    buffer=ctypes.create_unicode_buffer(name) if isinstance(name,str) else None
    pointer=ctypes.cast(buffer,ctypes.c_void_p) if buffer is not None else ctypes.c_void_p(name)
    found=kernel.FindResourceW(module,pointer,ctypes.c_void_p(kind))
    assert found,(name,kind,ctypes.get_last_error())
    size=kernel.SizeofResource(module,found)
    address=kernel.LockResource(kernel.LoadResource(module,found))
    assert address
    return ctypes.string_at(address,size)
try:
    group=resource('IDR_MAINFRAME',14)
    reserved,kind,count=struct.unpack_from('<HHH',group)
    assert (reserved,kind,count)==(0,1,9)
    sizes=[]
    for i in range(count):
        width,height,_,_,planes,bits,length,ident=struct.unpack_from('<BBBBHHIH',group,6+14*i)
        size=width or 256
        expected=(root/f'assets/branding/png/{size}.png').read_bytes()
        assert resource(ident,3)==expected,(size,'compiled icon differs from Senda asset')
        sizes.append(size)
    assert sizes==[16,20,24,32,40,48,64,128,256]
    print('PASS: compiled IDR_MAINFRAME contains all nine Senda icon sizes.')
finally:
    kernel.FreeLibrary(module)
