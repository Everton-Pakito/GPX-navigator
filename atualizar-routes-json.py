import os, json

routes_dir = "routes"
routes = []

for file in os.listdir(routes_dir):
    if file.endswith(".gpx"):
        routes.append({
            "name": os.path.splitext(file)[0].replace("_", " ").title(),
            "file": f"{routes_dir}/{file}"
        })

with open("routes.json", "w") as f:
    json.dump(routes, f, indent=2)

print("routes.json atualizado com sucesso!")