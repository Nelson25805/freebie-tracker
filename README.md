<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
-->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![project_license][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/Nelson25805/freebie-tracker">
    <img src="GithubImages/logo.png" alt="Logo" width="200" height="200">
  </a>

<h3 align="center">Freebie Tracker</h3>

  <p align="center">
    A simple java application to receive recipe's for a multitude of recipes depending on the ingredients available.
    <br />
    <a href="https://github.com/Nelson25805/recipeSuggester"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/Nelson25805/recipeSuggester">View Demo</a>
    &middot;
    <a href="https://github.com/Nelson25805/recipeSuggester/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/Nelson25805/recipeSuggester/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>


<!-- ABOUT THE PROJECT -->
## About The Project

![Recipe Suggester Screenshot][project-screenshot]

Recipe Suggester is a Java-based console application that lets users search for recipes by ingredient using [TheMealDB](https://www.themealdb.com/) API.

The app allows you to:
- search for recipes by entering a main ingredient
- view recipe details, ingredients, and instructions
- save recipes locally as text files
- browse recipes through a simple menu-driven interface

This project is a good example of working with:
- HTTP requests
- JSON response parsing
- file saving
- interactive console input
- basic Java application structure

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

| Badge | Description |
|:-----:|-------------|
| [![Java](GithubImages/javaShield.svg)][Java-url] | Core programming language |
| [![TheMealDB](GithubImages/theMealDBShield.svg)][themealdb-url] | Recipe data source |
| [![HTTP](GithubImages/httpShield.svg)][http-url] | API communication |
| [![File I/O](GithubImages/fileIOShield.svg)][fileio-url] | Saving recipes locally |

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- GETTING STARTED -->
## Getting Started

Follow these steps to run the project locally.

### Prerequisites

- Java JDK installed
- Internet connection
- A terminal or command prompt

### Installation

1. Clone the repository
   ```sh
   git clone https://github.com/Nelson25805/recipeSuggester.git
Open the project folder

Compile the program

javac RecipeSuggester.java

Run the application

java RecipeSuggester
<p align="right">(<a href="#readme-top">back to top</a>)</p> <!-- USAGE -->

## Usage

When the application starts, you will see a main menu with these options:

Search for recipes by ingredient
Exit

To search for a recipe:

choose option 1
enter an ingredient such as chicken, rice, or pasta
browse the matching recipes returned by TheMealDB
select a recipe to view ingredients and instructions
choose whether to save the recipe to a local text file

Saved recipes are stored in a Recipes folder in the project directory.

<p align="right">(<a href="#readme-top">back to top</a>)</p> <!-- FEATURES -->

## Contributing

Contributions are what make the open source community such an amazing place to learn and create. Any contributions you make are greatly appreciated.

Fork the Project
Create your Feature Branch (git checkout -b feature/AmazingFeature)
Commit your Changes (git commit -m 'Add some AmazingFeature')
Push to the Branch (git push origin feature/AmazingFeature)
Open a Pull Request
<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Top contributors:

<a href="https://github.com/Nelson25805/passwordManager/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Nelson25805/passwordManager" alt="contrib.rocks image" />
</a>

## License

Distributed under the project_license. See LICENSE.txt for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p> <!-- CONTACT -->
## Contact

Nelson McFadyen - Nelson25805@hotmail.com

Project Link: https://github.com/Nelson25805/recipeSuggester

<p align="right">(<a href="#readme-top">back to top</a>)</p> <!-- MARKDOWN LINKS -->


<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/Nelson25805/passwordManager.svg?style=for-the-badge
[contributors-url]: https://github.com/Nelson25805/passwordManager/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Nelson25805/passwordManager.svg?style=for-the-badge
[forks-url]: https://github.com/Nelson25805/passwordManager/network/members
[stars-shield]: https://img.shields.io/github/stars/Nelson25805/passwordManager.svg?style=for-the-badge
[stars-url]: https://github.com/Nelson25805/passwordManager/stargazers
[issues-shield]: https://img.shields.io/github/issues/Nelson25805/passwordManager.svg?style=for-the-badge
[issues-url]: https://github.com/Nelson25805/passwordManager/issues
[license-shield]: https://img.shields.io/github/license/Nelson25805/passwordManager.svg?style=for-the-badge
[license-url]: https://github.com/Nelson25805/passwordManager/blob/master/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://www.linkedin.com/in/nelson-mcfadyen-806134133/

[project-Image]: GithubImages/projectImage.png

[project-screenshot]: GithubImages/mainScreen.png
[project-screenshot2]: GithubImages/filteredGameSearch.gif
[project-screenshot3]: GithubImages/randomGameSearch.gif

[project-screenshot4]: GithubImages/excelExample.png
[project-screenshot5]: GithubImages/envExample.png


[Java-url]: https://www.java.com/en/download/manual.jsp
[GTK3-url]: https://www.gtk.org/
[SQLite3-url]: https://www.sqlite.org/download.html
[OpenSSL-url]: https://openssl-library.org/source/
[Bcrypt-url]: https://rubygems.org/gems/bcrypt/versions/3.1.12?locale=en


[Python]: https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54
[Tkinter]: https://img.shields.io/badge/Tkinter-8.6-green
[JQuery.com]: https://img.shields.io/badge/jQuery-0769AD?style=for-the-badge&logo=jquery&logoColor=white


