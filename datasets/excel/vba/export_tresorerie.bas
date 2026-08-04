Attribute VB_Name = "ExportTresorerie"
Option Explicit

' Exporte l'onglet "Treso13" en CSV a cote du classeur.
' Ce module est fourni pour lecture et pour un usage local dans Excel :
' la plateforme ne l'execute jamais.
Sub ExporterTresorerieCsv()
    Dim ws As Worksheet
    Dim chemin As String

    Set ws = ThisWorkbook.Worksheets("Treso13")
    chemin = ThisWorkbook.Path & Application.PathSeparator & "treso_13_semaines.csv"

    Application.ScreenUpdating = False
    ws.Copy
    ActiveWorkbook.SaveAs Filename:=chemin, FileFormat:=xlCSV, Local:=True
    ActiveWorkbook.Close SaveChanges:=False
    Application.ScreenUpdating = True
End Sub
