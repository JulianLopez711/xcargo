import easyocr

reader = easyocr.Reader(["es"])

def leer_texto_ocr(imagen_path: str) -> str:
    resultados = reader.readtext(imagen_path, detail=0, paragraph=True)
    return " ".join(resultados)
