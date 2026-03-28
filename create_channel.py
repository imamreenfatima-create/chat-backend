import urllib.request, json

data = json.dumps({"email":"test2@test.com","password":"password123"}).encode()
req = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data, headers={"Content-Type":"application/json"})
res = json.loads(urllib.request.urlopen(req).read().decode())
token = res["access_token"]
print("Login OK!")

data2 = json.dumps({"name":"general","description":"General chat","icon":"💬","color":"#6366f1"}).encode()
req2 = urllib.request.Request("http://127.0.0.1:8000/api/projects/", data=data2, headers={"Content-Type":"application/json","Authorization":"Bearer "+token})
res2 = json.loads(urllib.request.urlopen(req2).read().decode())
print("Channel created!")
print(res2)