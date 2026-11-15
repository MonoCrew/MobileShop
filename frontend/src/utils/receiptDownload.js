  import html2canvas from "html2canvas";
  import jsPDF from "jspdf";


  export const downloadReceiptAsPdf = async (elementId, filename = "receipt.pdf") => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`[receiptDownload] Element #${elementId} not found.`);
      return false;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdfWidth = 80; // mm
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidth, Math.max(pdfHeight, 100)],
      });

      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
      return true;
    } catch (error) {
      console.error("[receiptDownload] PDF generation error:", error);
      throw error;
    }
  };


  export const downloadReceiptAsImage = async (elementId, filename = "receipt.png") => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`[receiptDownload] Element #${elementId} not found.`);
      return false;
    }

    try {
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const link = document.createElement("a");
      link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch (error) {                   
      console.error("[ReceiptDownload] Image generation error:", error);
      throw error;
    }
  };
